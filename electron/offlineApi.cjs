const crypto = require('crypto');
const posSqlite = require('./posSqliteService.cjs');
const OFFLINE_SESSION_TOKEN = 'pos_offline_sqlite';

function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;
  const parts = String(stored).split('$');
  if (parts[0] !== 'scrypt1' || parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let hash;
  try {
    hash = crypto.scryptSync(plain, salt, 64);
  } catch {
    return false;
  }
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function parseJsonBody(body) {
  if (body == null || body === '') return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(String(body));
  } catch {
    return {};
  }
}

function safeJson(v, fallback = null) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureKvAndStores(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      ns TEXT NOT NULL,
      k TEXT NOT NULL,
      v TEXT NOT NULL,
      PRIMARY KEY (ns, k)
    );
    CREATE TABLE IF NOT EXISTS stores (
      store_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

function ensureDefaultStore(db) {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO stores (store_id, name, phone, address, created_at)
     VALUES ('local_default', 'Cửa hàng offline', '', '', ?)`,
  ).run(now);
}

function listPosDocs(db, tableName) {
  try {
    return db.prepare(`SELECT doc FROM ${tableName}`).all().map((r) => safeJson(r.doc, {}));
  } catch {
    return [];
  }
}

function putPosDoc(db, tableName, localId, doc) {
  db.prepare(`INSERT OR REPLACE INTO ${tableName} (local_id, doc) VALUES (?, ?)`).run(localId, JSON.stringify(doc));
}

function deletePosDoc(db, tableName, localId) {
  db.prepare(`DELETE FROM ${tableName} WHERE local_id = ?`).run(localId);
}

function listKvNs(db, ns) {
  return db
    .prepare(`SELECT k, v FROM kv_store WHERE ns = ? ORDER BY k`)
    .all(ns)
    .map((row) => {
      const parsed = safeJson(row.v, null);
      if (!parsed || typeof parsed !== 'object') return null;
      return { ...parsed, _id: parsed._id || row.k };
    })
    .filter(Boolean);
}

function upsertKvNs(db, ns, id, doc) {
  db.prepare(`INSERT OR REPLACE INTO kv_store (ns, k, v) VALUES (?, ?, ?)`).run(ns, id, JSON.stringify(doc));
}

const CUSTOMER_LOYALTY_SETTINGS_KEY = 'customer_loyalty';
const DATA_CLEANUP_HISTORY_KEY = 'data_cleanup_history';
const DATA_CLEANUP_SCHEDULES_KEY = 'data_cleanup_schedules';
const STORE_PROFILE_HISTORY_KEY = 'store_profile_history';

function defaultCustomerLoyaltySettings() {
  return {
    _id: CUSTOMER_LOYALTY_SETTINGS_KEY,
    enabled: true,
    earningMethod: 'order', // order | product
    earningAmount: 100000, // VND
    earningPoints: 1, // points
    allowPointPayment: true,
    redeemPoints: 1,
    redeemAmount: 1000, // VND
    minOrdersBeforeRedeem: 1,
    allowEarnOnDiscountedItem: true,
    allowEarnOnDiscountedOrder: false,
    allowEarnWhenPayingByPoints: false,
    allowEarnWhenPayingByVoucher: false,
    enablePromotion: false,
    enableVoucher: false,
    enableCoupon: false,
    updatedAt: Date.now(),
  };
}

function getCustomerLoyaltySettings(db) {
  const row = db
    .prepare(`SELECT v FROM kv_store WHERE ns = 'setting' AND k = ?`)
    .get(CUSTOMER_LOYALTY_SETTINGS_KEY);
  if (!row) return defaultCustomerLoyaltySettings();
  const parsed = safeJson(row.v, null);
  if (!parsed || typeof parsed !== 'object') return defaultCustomerLoyaltySettings();
  return {
    ...defaultCustomerLoyaltySettings(),
    ...parsed,
    _id: CUSTOMER_LOYALTY_SETTINGS_KEY,
  };
}

function getDataCleanupHistory(db) {
  const row = db.prepare(`SELECT v FROM kv_store WHERE ns = 'setting' AND k = ?`).get(DATA_CLEANUP_HISTORY_KEY);
  if (!row) return [];
  const parsed = safeJson(row.v, []);
  const items = Array.isArray(parsed) ? parsed : [];
  let changed = false;
  const normalized = items.map((item, idx) => {
    if (item && item.id) return item;
    changed = true;
    return {
      ...item,
      id: `cleanup_legacy_${normalizeTs(item?.executedAt) || Date.now()}_${idx}`,
    };
  });
  if (changed) {
    saveDataCleanupHistory(db, normalized);
  }
  return normalized;
}

function saveDataCleanupHistory(db, items) {
  upsertKvNs(db, 'setting', DATA_CLEANUP_HISTORY_KEY, items);
}

function getDataCleanupSchedules(db) {
  const row = db.prepare(`SELECT v FROM kv_store WHERE ns = 'setting' AND k = ?`).get(DATA_CLEANUP_SCHEDULES_KEY);
  if (!row) return [];
  const parsed = safeJson(row.v, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveDataCleanupSchedules(db, items) {
  upsertKvNs(db, 'setting', DATA_CLEANUP_SCHEDULES_KEY, items);
}

function getStoreProfileHistory(db) {
  const row = db.prepare(`SELECT v FROM kv_store WHERE ns = 'setting' AND k = ?`).get(STORE_PROFILE_HISTORY_KEY);
  const parsed = safeJson(row?.v || '[]', []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveStoreProfileHistory(db, items) {
  upsertKvNs(db, 'setting', STORE_PROFILE_HISTORY_KEY, Array.isArray(items) ? items : []);
}

function matchDocByPeriod(doc, inPeriod) {
  const ts = normalizeTs(doc?.createdAt || doc?.updatedAt || doc?.deletedAt);
  return ts > 0 ? inPeriod(ts) : false;
}

function buildCleanupRangePredicate(payload = {}) {
  const params = new URLSearchParams();
  const periodType = String(payload.periodType || 'day');
  params.set('type', periodType);
  if (payload.date) params.set('date', String(payload.date));
  if (payload.month) params.set('month', String(payload.month));
  if (payload.quarter) params.set('quarter', String(payload.quarter));
  if (payload.year) params.set('year', String(payload.year));
  if (payload.lunarYear) params.set('lunarYear', String(payload.lunarYear));
  if (payload.dateFrom) params.set('dateFrom', String(payload.dateFrom));
  if (payload.dateTo) params.set('dateTo', String(payload.dateTo));
  return buildPeriodFilter(params);
}

function runDataCleanup(db, payload = {}) {
  const mode = String(payload.mode || 'full');
  const inPeriod = buildCleanupRangePredicate(payload);
  const summary = {
    mode,
    removedOrders: 0,
    removedReturns: 0,
    removedProducts: 0,
    removedCustomers: 0,
    removedSuppliers: 0,
    removedPurchaseOrders: 0,
    removedKvRows: 0,
  };

  const deletePosByPeriod = (table) => {
    const rows = db.prepare(`SELECT local_id, doc FROM ${table}`).all();
    const ids = [];
    for (const row of rows) {
      const doc = safeJson(row.doc, null);
      if (doc && matchDocByPeriod(doc, inPeriod)) {
        ids.push(row.local_id);
      }
    }
    const del = db.prepare(`DELETE FROM ${table} WHERE local_id = ?`);
    ids.forEach((id) => del.run(id));
    return ids;
  };

  const deleteKvByNsPeriod = (nsList, forceIfNoTs = false) => {
    const rows = db.prepare(`SELECT ns, k, v FROM kv_store WHERE ns IN (${nsList.map(() => '?').join(',')})`).all(...nsList);
    const del = db.prepare(`DELETE FROM kv_store WHERE ns = ? AND k = ?`);
    let count = 0;
    for (const row of rows) {
      const doc = safeJson(row.v, null);
      const matched = doc ? matchDocByPeriod(doc, inPeriod) : false;
      if (matched || (!doc && forceIfNoTs)) {
        del.run(row.ns, row.k);
        count += 1;
      }
    }
    return count;
  };

  db.exec('BEGIN');
  try {
    const deletedOrderIds = deletePosByPeriod('pos_orders');
    summary.removedOrders = deletedOrderIds.length;
    if (deletedOrderIds.length) {
      const delOrderItems = db.prepare('DELETE FROM pos_order_items WHERE order_local_id = ?');
      deletedOrderIds.forEach((id) => delOrderItems.run(id));
    }

    const deletedReturnIds = deletePosByPeriod('pos_returns');
    summary.removedReturns = deletedReturnIds.length;
    if (deletedReturnIds.length) {
      const delReturnItems = db.prepare('DELETE FROM pos_return_items WHERE return_local_id = ?');
      deletedReturnIds.forEach((id) => delReturnItems.run(id));
    }

    summary.removedKvRows += deleteKvByNsPeriod(['order_bundle', 'return_bundle'], true);

    if (mode === 'full') {
      summary.removedProducts = deletePosByPeriod('pos_products').length;
      summary.removedCustomers = deletePosByPeriod('pos_customers').length;
      summary.removedKvRows += deleteKvByNsPeriod(['product', 'category', 'brand'], true);

      const removedSuppliers = deleteKvByNsPeriod(['supplier', 'supplier_group'], true);
      summary.removedSuppliers = removedSuppliers;
      summary.removedKvRows += removedSuppliers;
    }

    const removedPOs = deleteKvByNsPeriod(['purchase_order'], true);
    summary.removedPurchaseOrders = removedPOs;
    summary.removedKvRows += removedPOs;

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const history = getDataCleanupHistory(db);
  history.unshift({
    id: `cleanup_${Date.now()}`,
    source: payload.source || 'manual',
    scheduleId: payload.scheduleId || '',
    mode,
    periodType: payload.periodType || 'day',
    date: payload.date || '',
    month: payload.month || '',
    quarter: payload.quarter || '',
    year: payload.year || '',
    lunarYear: payload.lunarYear || '',
    dateFrom: payload.dateFrom || '',
    dateTo: payload.dateTo || '',
    executedAt: new Date().toISOString(),
    summary,
  });
  saveDataCleanupHistory(db, history.slice(0, 100));

  return summary;
}

function processDueCleanupSchedules(db) {
  const schedules = getDataCleanupSchedules(db);
  if (!schedules.length) return schedules;
  const nowTs = Date.now();
  const next = schedules.map((item) => ({ ...item }));
  let changed = false;
  for (const schedule of next) {
    if (schedule.status !== 'pending') continue;
    const runAtTs = normalizeTs(schedule.runAt);
    if (!runAtTs || runAtTs > nowTs) continue;
    try {
      const summary = runDataCleanup(db, {
        ...schedule.payload,
        source: 'schedule',
        scheduleId: schedule.id,
      });
      schedule.status = 'done';
      schedule.executedAt = new Date().toISOString();
      schedule.summary = summary;
    } catch (err) {
      schedule.status = 'failed';
      schedule.executedAt = new Date().toISOString();
      schedule.error = String(err?.message || err);
    }
    changed = true;
  }
  if (changed) {
    saveDataCleanupSchedules(db, next);
  }
  return next;
}

function migrateLegacyProductsToKv(db) {
  ensureKvAndStores(db);
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM kv_store WHERE ns = 'product'`).get();
  if (c > 0) return;
  const rows = db.prepare('SELECT * FROM products').all();
  const ins = db.prepare(`INSERT OR REPLACE INTO kv_store (ns, k, v) VALUES ('product', ?, ?)`);
  for (const row of rows) {
    const localId = `p-${row.id}`;
    ins.run(
      localId,
      JSON.stringify({
        localId,
        productCode: row.sku || `SP${String(row.id).padStart(6, '0')}`,
        name: row.name,
        barcode: row.barcode || '',
        price: Number(row.price) || 0,
        stock: Number(row.stock) || 0,
        unit: row.unit || 'cai',
        synced: true,
        deleted: false,
        allowPoints: true,
      }),
    );
  }
}

function normalizeTs(value) {
  if (!value) return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function computeOrderItemsByOrderId(db) {
  const map = new Map();
  try {
    const rows = db.prepare('SELECT order_local_id, doc FROM pos_order_items ORDER BY id').all();
    for (const row of rows) {
      const arr = map.get(row.order_local_id) || [];
      arr.push(safeJson(row.doc, {}));
      map.set(row.order_local_id, arr);
    }
  } catch {
    // ignore
  }
  return map;
}

function computeReturnItemsByReturnId(db) {
  const map = new Map();
  try {
    const rows = db.prepare('SELECT return_local_id, doc FROM pos_return_items ORDER BY id').all();
    for (const row of rows) {
      const arr = map.get(row.return_local_id) || [];
      arr.push(safeJson(row.doc, {}));
      map.set(row.return_local_id, arr);
    }
  } catch {
    // ignore
  }
  return map;
}

function parseQuery(pathLike) {
  const url = new URL(String(pathLike || ''), 'http://offline.local');
  return { pathname: url.pathname, searchParams: url.searchParams };
}

function buildPeriodFilter(searchParams) {
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  if (dateFrom || dateTo) {
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;
    return (ts) => ts >= fromTs && ts <= toTs;
  }

  const type = searchParams.get('type') || 'day';
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (type === 'month') {
    const m = (searchParams.get('month') || '').split('-');
    const year = Number(m[0]) || now.getFullYear();
    const month = (Number(m[1]) || now.getMonth() + 1) - 1;
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  } else if (type === 'year' || type === 'lunarYear') {
    const year = Number(searchParams.get('year') || searchParams.get('lunarYear')) || now.getFullYear();
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31, 23, 59, 59, 999);
  } else if (type === 'quarter') {
    const year = Number(searchParams.get('year')) || now.getFullYear();
    const quarter = Math.min(4, Math.max(1, Number(searchParams.get('quarter')) || 1));
    const monthStart = (quarter - 1) * 3;
    start = new Date(year, monthStart, 1);
    end = new Date(year, monthStart + 3, 0, 23, 59, 59, 999);
  } else {
    const d = searchParams.get('date');
    if (d) {
      start = new Date(`${d}T00:00:00`);
      end = new Date(`${d}T23:59:59.999`);
    }
  }
  const fromTs = start.getTime();
  const toTs = end.getTime();
  return (ts) => ts >= fromTs && ts <= toTs;
}

function getProducts(db) {
  return listPosDocs(db, 'pos_products')
    .filter((p) => !p.deleted)
    .map((p) => ({ ...p, localId: p.localId || p._id, _id: p.localId || p._id }));
}

function searchProductsPaged(db, { q = '', page = 1, limit = 80 }) {
  const term = String(q || '').trim().toLowerCase();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 80));
  const offset = (safePage - 1) * safeLimit;
  const like = `%${term}%`;

  try {
    const rows = db
      .prepare(
        `SELECT doc
         FROM pos_products
         WHERE COALESCE(json_extract(doc, '$.deleted'), 0) != 1
           AND (
             ? = ''
             OR lower(
               COALESCE(json_extract(doc, '$.name'), '') || ' ' ||
               COALESCE(json_extract(doc, '$.productCode'), '') || ' ' ||
               COALESCE(json_extract(doc, '$.barcode'), '')
             ) LIKE ?
           )
         ORDER BY COALESCE(json_extract(doc, '$.updatedAt'), json_extract(doc, '$.createdAt'), 0) DESC
         LIMIT ? OFFSET ?`,
      )
      .all(term, like, safeLimit, offset)
      .map((r) => safeJson(r.doc, {}))
      .map((p) => ({ ...p, localId: p.localId || p._id, _id: p.localId || p._id }));

    const countRow = db.prepare(
      `SELECT COUNT(*) AS total
       FROM pos_products
       WHERE COALESCE(json_extract(doc, '$.deleted'), 0) != 1
         AND (
           ? = ''
           OR lower(
             COALESCE(json_extract(doc, '$.name'), '') || ' ' ||
             COALESCE(json_extract(doc, '$.productCode'), '') || ' ' ||
             COALESCE(json_extract(doc, '$.barcode'), '')
           ) LIKE ?
         )`,
    ).get(term, like);

    return { products: rows, total: Number(countRow?.total) || 0, page: safePage, limit: safeLimit };
  } catch {
    // Fallback cho DB cũ thiếu JSON1 hoặc edge-case parsing.
    const all = getProducts(db)
      .filter((p) => {
        if (!term) return true;
        const text = `${p.name || ''} ${p.productCode || ''} ${p.barcode || ''}`.toLowerCase();
        return text.includes(term);
      })
      .sort((a, b) => normalizeTs(b.updatedAt || b.createdAt) - normalizeTs(a.updatedAt || a.createdAt));
    const start = (safePage - 1) * safeLimit;
    return { products: all.slice(start, start + safeLimit), total: all.length, page: safePage, limit: safeLimit };
  }
}

function getCustomers(db) {
  return listPosDocs(db, 'pos_customers').map((c) => ({
    ...c,
    localId: c.localId || c._id,
    _id: c.localId || c._id,
    name: c.name || c.fullName || '',
  }));
}

function isWalkInCustomer(customer) {
  const code = String(customer?.customerCode || '').trim().toUpperCase();
  const name = String(customer?.name || customer?.fullName || '').trim().toLowerCase();
  const localId = String(customer?.localId || customer?._id || '').trim();
  return localId === 'c-demo-000001' || (code === 'KH000001' && name === 'khách lẻ');
}

function getOrders(db) {
  return listPosDocs(db, 'pos_orders').map((o) => ({
    ...o,
    localId: o.localId || o._id,
    _id: o.localId || o._id,
    createdAt: o.createdAt || o.created_at || Date.now(),
  }));
}

function getReturns(db) {
  return listPosDocs(db, 'pos_returns').map((r) => ({
    ...r,
    localId: r.localId || r._id,
    _id: r.localId || r._id,
    createdAt: r.createdAt || r.created_at || Date.now(),
  }));
}

function getSupplierGroups(db) {
  return listKvNs(db, 'supplier_group').map((g) => ({
    ...g,
    _id: g._id || g.id || makeId('sg'),
    name: String(g.name || '').trim(),
    notes: String(g.notes || '').trim(),
  }));
}

function getSuppliers(db) {
  return listKvNs(db, 'supplier')
    .map((s) => ({
      ...s,
      _id: s._id || s.id || makeId('sp'),
      code: String(s.code || '').trim(),
      name: String(s.name || '').trim(),
      phone: String(s.phone || '').trim(),
      email: String(s.email || '').trim(),
      status: s.status === 'inactive' ? 'inactive' : 'active',
      currentDebt: Number(s.currentDebt) || 0,
      totalPurchase: Number(s.totalPurchase) || 0,
      paidAmount: Number(s.paidAmount) || 0,
      purchaseCount: Number(s.purchaseCount) || 0,
      totalImportedQty: Number(s.totalImportedQty) || 0,
      createdAt: s.createdAt || Date.now(),
    }))
    .sort((a, b) => normalizeTs(b.createdAt) - normalizeTs(a.createdAt));
}

function getPurchaseOrders(db) {
  return listKvNs(db, 'purchase_order')
    .map((o) => ({
      ...o,
      _id: o._id || o.id || makeId('po'),
      code: String(o.code || ''),
      status: o.status || 'draft',
      amountToPay: Number(o.amountToPay) || 0,
      amountPaid: Number(o.amountPaid) || 0,
      items: Array.isArray(o.items) ? o.items : [],
      createdAt:
        normalizeTs(o.createdAt) > 946684800000
          ? normalizeTs(o.createdAt)
          : (normalizeTs(o.updatedAt) > 946684800000 ? normalizeTs(o.updatedAt) : Date.now()),
      updatedAt: o.updatedAt || o.createdAt || Date.now(),
    }))
    .sort((a, b) => normalizeTs(b.createdAt) - normalizeTs(a.createdAt));
}

function aggregatePurchaseItems(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const code = String(item?.productCode || '').trim().toLowerCase();
    const pid = String(item?.productId || '').trim();
    if (!code && !pid) continue;
    const qty = Number(item?.quantity) || 0;
    if (!qty) continue;
    const key = pid || code;
    const cur = map.get(key) || {
      qty: 0,
      unitPrice: 0,
      productCode: item?.productCode || '',
      productId: pid || '',
    };
    cur.qty += qty;
    cur.unitPrice = Number(item?.unitPrice) || cur.unitPrice || 0;
    if (!cur.productCode) cur.productCode = item?.productCode || '';
    if (!cur.productId) cur.productId = pid;
    map.set(key, cur);
  }
  return map;
}

function applyPurchaseOrderStockDelta(db, beforeItems, afterItems) {
  const before = aggregatePurchaseItems(beforeItems);
  const after = aggregatePurchaseItems(afterItems);
  const products = getProducts(db);
  const byCode = new Map(products.map((pItem) => [String(pItem.productCode || '').trim().toLowerCase(), pItem]));
  const byId = new Map(
    products.map((pItem) => [String(pItem.localId || pItem._id || '').trim(), pItem]).filter((entry) => entry[0]),
  );

  const allKeys = new Set([...before.keys(), ...after.keys()]);
  allKeys.forEach((key) => {
    const prevQty = Number(before.get(key)?.qty) || 0;
    const nextQty = Number(after.get(key)?.qty) || 0;
    const delta = nextQty - prevQty;
    if (!delta) return;
    const info = after.get(key) || before.get(key) || {};
    const lookupId = String(info.productId || '').trim();
    const lookupCode = String(info.productCode || '').trim().toLowerCase();
    const target = (lookupId && byId.get(lookupId)) || (lookupCode && byCode.get(lookupCode));
    if (!target) return;
    const nextStock = Math.max(0, (Number(target.stock) || 0) + delta);
    const nextCost = Number(after.get(key)?.unitPrice) || Number(target.costPrice) || 0;
    const next = {
      ...target,
      stock: nextStock,
      costPrice: nextCost,
      updatedAt: Date.now(),
    };
    putPosDoc(db, 'pos_products', next.localId || next._id, next);
    upsertKvNs(db, 'product', next.localId || next._id, next);
  });
}

function nextPurchaseOrderCode(db) {
  const all = getPurchaseOrders(db);
  let max = 0;
  for (const o of all) {
    const m = String(o.code || '').match(/^PN(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `PN${String(max + 1).padStart(6, '0')}`;
}

function computeCustomerMetrics(customer, orders, returns) {
  const customerId = customer.localId || customer._id;
  const phone = String(customer.phone || '');
  const ownOrders = orders.filter(
    (o) =>
      String(o.customerLocalId || '') === String(customerId || '') ||
      (phone && String(o.customerPhone || '') === phone),
  );
  const ownReturns = returns.filter(
    (r) =>
      String(r.customerLocalId || '') === String(customerId || '') ||
      (phone && String(r.customerPhone || '') === phone),
  );
  const totalSales = ownOrders
    .filter((o) => String(o.status || '').toLowerCase() !== 'cancelled')
    .reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const totalReturns = ownReturns.reduce((s, r) => s + (Number(r.totalReturnAmount) || 0), 0);
  return {
    totalSales,
    totalReturns,
    netSales: totalSales - totalReturns,
    debt: Number(customer.debt) || 0,
    points: Number(customer.points) || 0,
    orders: ownOrders,
    returns: ownReturns,
  };
}

function createUsersResponseRows(db) {
  const rows = db.prepare('SELECT id, email, name, role, phone, created_at FROM users ORDER BY id').all();
  return rows.map((row) => ({
    id: String(row.id),
    _id: String(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    phone: row.phone || '',
    createdAt: row.created_at,
  }));
}

function normalizeUserRow(row) {
  return {
    id: String(row.id),
    _id: String(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    storeIds: ['local_default'],
  };
}

function createUserAccount(db, payload = {}) {
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const roleInput = String(payload.role || 'cashier').trim().toLowerCase();
  const role = roleInput === 'owner' ? 'owner' : 'cashier';
  const phone = String(payload.phone || '').trim();

  if (!name || !email || !password) {
    throw new Error('Thieu thong tin tao user');
  }
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Email khong hop le');
  }
  if (password.length < 6) {
    throw new Error('Mat khau toi thieu 6 ky tu');
  }

  const existed = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existed) {
    throw new Error('Email da ton tai');
  }

  db.prepare(
    `INSERT INTO users (email, password_hash, name, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(email, hashPassword(password), name, role || 'cashier', phone, Date.now());

  return db.prepare('SELECT id, email, name, role, phone FROM users WHERE lower(email) = ?').get(email);
}

function handleAuthRegister(db, payload = {}) {
  const confirmPassword = payload.confirmPassword;
  if (confirmPassword != null && String(confirmPassword) !== String(payload.password || '')) {
    return { ok: false, message: 'Mat khau xac nhan khong khop' };
  }
  try {
    const row = createUserAccount(db, { ...payload, role: 'owner' });
    return {
      ok: true,
      token: OFFLINE_SESSION_TOKEN,
      user: normalizeUserRow(row),
    };
  } catch (err) {
    return { ok: false, message: String(err?.message || 'Dang ky that bai') };
  }
}

function handleAuthLogin(db, identifier, password) {
  const id = String(identifier || '').trim();
  if (!id || !password) {
    return { ok: false, message: 'Vui long nhap day du thong tin' };
  }
  const emailLower = id.includes('@') ? id.toLowerCase() : '';
  const row = emailLower
    ? db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(emailLower)
    : db.prepare('SELECT * FROM users WHERE phone = ?').get(id);
  if (!row) return { ok: false, message: 'Sai thong tin dang nhap' };
  if (!verifyPassword(password, row.password_hash)) return { ok: false, message: 'Sai thong tin dang nhap' };
  return { ok: true, user: normalizeUserRow(row) };
}

function handleOfflineRequest(db, { method, path, body }) {
  const m = String(method || 'GET').toUpperCase();
  const { pathname: p, searchParams } = parseQuery(path);
  const b = parseJsonBody(body);
  processDueCleanupSchedules(db);

  if (m === 'POST' && p === '/api/auth/login') {
    const result = handleAuthLogin(db, b.identifier, b.password);
    if (!result.ok) {
      return { __error: true, status: 401, message: result.message || 'Dang nhap that bai' };
    }
    return { token: OFFLINE_SESSION_TOKEN, user: result.user };
  }
  if (m === 'POST' && p === '/api/auth/register') {
    const result = handleAuthRegister(db, b);
    if (!result.ok) {
      return { __error: true, status: 400, message: result.message || 'Dang ky that bai' };
    }
    return { token: OFFLINE_SESSION_TOKEN, user: result.user };
  }
  if (m === 'GET' && p === '/api/auth/register-status') {
    return { canRegisterOwner: true };
  }

  // Sync endpoints for POS page
  if (m === 'GET' && p === '/api/sync/bootstrap') return posSqlite.handlePosDb(db, { op: 'exportBootstrap' });
  if (m === 'POST' && p === '/api/sync/master') {
    const products = Array.isArray(b.products) ? b.products : [];
    const customers = Array.isArray(b.customers) ? b.customers : [];
    posSqlite.handlePosDb(db, { op: 'mergeMaster', products, customers });
    return { syncedProducts: products.length, syncedCustomers: customers.length };
  }
  if (m === 'POST' && p === '/api/sync/orders') {
    const orders = Array.isArray(b.orders) ? b.orders : [];
    const orderItems = Array.isArray(b.orderItems) ? b.orderItems : [];
    const ins = db.prepare(`INSERT OR REPLACE INTO kv_store (ns, k, v) VALUES ('order_bundle', ?, ?)`);
    for (const o of orders) {
      if (!o || !o.localId) continue;
      const related = orderItems.filter((it) => it && it.orderLocalId === o.localId);
      ins.run(String(o.localId), JSON.stringify({ order: o, items: related }));
    }
    return { syncedOrders: orders.length, syncedItems: orderItems.length };
  }
  if (m === 'POST' && p === '/api/sync/returns') {
    const returns = Array.isArray(b.returns) ? b.returns : [];
    const returnItems = Array.isArray(b.returnItems) ? b.returnItems : [];
    const ins = db.prepare(`INSERT OR REPLACE INTO kv_store (ns, k, v) VALUES ('return_bundle', ?, ?)`);
    for (const r of returns) {
      if (!r || !r.localId) continue;
      const related = returnItems.filter((it) => it && it.returnLocalId === r.localId);
      ins.run(String(r.localId), JSON.stringify({ return: r, returnItems: related, exchangeItems: r.exchangeItems || [] }));
    }
    return { syncedReturns: returns.length, syncedItems: returnItems.length };
  }

  // Stores
  if (m === 'GET' && (p === '/api/stores/me' || p === '/api/stores')) {
    const websiteByStoreId = new Map(
      listKvNs(db, 'store_profile').map((item) => [String(item.storeId || item._id || ''), String(item.website || '')]),
    );
    const stores = db.prepare('SELECT * FROM stores ORDER BY store_id').all().map((row, idx) => ({
      _id: row.store_id,
      storeId: row.store_id,
      name: row.name,
      phone: row.phone || '',
      address: row.address || '',
      website: websiteByStoreId.get(String(row.store_id)) || '',
      isHeadquarters: idx === 0,
    }));
    return { stores };
  }
  if (m === 'POST' && p === '/api/stores') {
    const sid = String(b.storeId || makeId('store')).trim();
    const name = String(b.name || '').trim() || 'Cua hang';
    db.prepare(
      `INSERT OR REPLACE INTO stores (store_id, name, phone, address, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(sid, name, String(b.phone || '').trim(), String(b.address || '').trim(), Date.now());
    const website = String(b.website || '').trim();
    upsertKvNs(db, 'store_profile', sid, { _id: sid, storeId: sid, website, updatedAt: Date.now() });
    return { store: { _id: sid, storeId: sid, name, phone: b.phone || '', address: b.address || '', website } };
  }
  if (m === 'GET' && p === '/api/store-profile') {
    const storeRows = db.prepare('SELECT * FROM stores ORDER BY store_id').all();
    const requestedStoreId = String(searchParams.get('storeId') || '').trim();
    const row =
      storeRows.find((it) => String(it.store_id) === requestedStoreId) ||
      storeRows[0] ||
      null;
    if (!row) return { profile: null, history: [] };
    const sid = String(row.store_id);
    const profileKv = listKvNs(db, 'store_profile').find((it) => String(it.storeId || it._id || '') === sid) || {};
    const allHistory = getStoreProfileHistory(db);
    const history = allHistory
      .filter((it) => String(it.storeId || '') === sid)
      .sort((a, b) => normalizeTs(b.updatedAt) - normalizeTs(a.updatedAt))
      .slice(0, 50);
    return {
      profile: {
        _id: sid,
        storeId: sid,
        name: String(row.name || ''),
        phone: String(row.phone || ''),
        address: String(row.address || ''),
        website: String(profileKv.website || ''),
      },
      history,
    };
  }
  if (m === 'PATCH' && p === '/api/store-profile') {
    const storeRows = db.prepare('SELECT * FROM stores ORDER BY store_id').all();
    const requestedStoreId = String(b.storeId || '').trim();
    const row =
      storeRows.find((it) => String(it.store_id) === requestedStoreId) ||
      storeRows[0] ||
      null;
    if (!row) return { ok: false, error: 'Không tìm thấy gian hàng' };
    const sid = String(row.store_id);
    const nextName = String(b.name ?? row.name ?? '').trim();
    const nextPhone = String(b.phone ?? row.phone ?? '').trim();
    const nextAddress = String(b.address ?? row.address ?? '').trim();
    const nextWebsite = String(b.website || '').trim();
    db.prepare('UPDATE stores SET name = ?, phone = ?, address = ? WHERE store_id = ?')
      .run(nextName || 'Cửa hàng', nextPhone, nextAddress, sid);
    upsertKvNs(db, 'store_profile', sid, { _id: sid, storeId: sid, website: nextWebsite, updatedAt: Date.now() });
    const history = getStoreProfileHistory(db);
    history.push({
      _id: makeId('store_profile_history'),
      storeId: sid,
      updatedAt: Date.now(),
      updatedBy: String(b.updatedBy || b.userName || 'owner'),
      changes: {
        name: nextName || 'Cửa hàng',
        phone: nextPhone,
        address: nextAddress,
        website: nextWebsite,
      },
    });
    saveStoreProfileHistory(db, history.slice(-200));
    return {
      ok: true,
      profile: {
        _id: sid,
        storeId: sid,
        name: nextName || 'Cửa hàng',
        phone: nextPhone,
        address: nextAddress,
        website: nextWebsite,
      },
    };
  }

  // Users
  if (m === 'GET' && p === '/api/users') {
    return { users: createUsersResponseRows(db) };
  }
  if (m === 'POST' && p === '/api/users') {
    createUserAccount(db, b);
    return { ok: true };
  }

  // Supplier groups / suppliers
  if (m === 'GET' && p === '/api/supplier-groups') {
    return { groups: getSupplierGroups(db) };
  }
  if (m === 'POST' && p === '/api/supplier-groups') {
    const _id = String(b._id || makeId('sg'));
    const doc = {
      _id,
      name: String(b.name || '').trim(),
      notes: String(b.notes || '').trim(),
      createdAt: Date.now(),
    };
    upsertKvNs(db, 'supplier_group', _id, doc);
    return { group: doc };
  }
  if (m === 'GET' && p === '/api/suppliers') {
    return { suppliers: getSuppliers(db) };
  }
  if (m === 'POST' && p === '/api/suppliers') {
    const _id = String(b._id || makeId('sup'));
    const doc = {
      _id,
      code: String(b.code || '').trim(),
      name: String(b.name || '').trim(),
      phone: String(b.phone || '').trim(),
      email: String(b.email || '').trim(),
      address: String(b.address || '').trim(),
      area: String(b.area || '').trim(),
      ward: String(b.ward || '').trim(),
      notes: String(b.notes || '').trim(),
      companyName: String(b.companyName || '').trim(),
      taxCode: String(b.taxCode || '').trim(),
      group: String(b.group || '').trim(),
      status: b.status === 'inactive' ? 'inactive' : 'active',
      currentDebt: Number(b.currentDebt) || 0,
      totalPurchase: 0,
      paidAmount: 0,
      purchaseCount: 0,
      totalImportedQty: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    upsertKvNs(db, 'supplier', _id, doc);
    return { supplier: doc };
  }
  if (m === 'PATCH' && /^\/api\/suppliers\/[^/]+$/.test(p)) {
    const _id = decodeURIComponent(p.split('/').pop());
    const cur = getSuppliers(db).find((s) => String(s._id) === _id);
    if (!cur) return { ok: false };
    const next = {
      ...cur,
      ...b,
      _id,
      code: b.code != null ? String(b.code).trim() : cur.code,
      name: b.name != null ? String(b.name).trim() : cur.name,
      phone: b.phone != null ? String(b.phone).trim() : cur.phone,
      email: b.email != null ? String(b.email).trim() : cur.email,
      address: b.address != null ? String(b.address).trim() : cur.address,
      area: b.area != null ? String(b.area).trim() : cur.area,
      ward: b.ward != null ? String(b.ward).trim() : cur.ward,
      notes: b.notes != null ? String(b.notes).trim() : cur.notes,
      companyName: b.companyName != null ? String(b.companyName).trim() : cur.companyName,
      taxCode: b.taxCode != null ? String(b.taxCode).trim() : cur.taxCode,
      group: b.group != null ? String(b.group).trim() : cur.group,
      status: b.status != null ? (b.status === 'inactive' ? 'inactive' : 'active') : cur.status,
      currentDebt: b.currentDebt != null ? (Number(b.currentDebt) || 0) : (Number(cur.currentDebt) || 0),
      updatedAt: Date.now(),
    };
    upsertKvNs(db, 'supplier', _id, next);
    return { supplier: next };
  }
  if (m === 'DELETE' && /^\/api\/suppliers\/[^/]+$/.test(p)) {
    const _id = decodeURIComponent(p.split('/').pop());
    db.prepare(`DELETE FROM kv_store WHERE ns = 'supplier' AND k = ?`).run(_id);
    return { ok: true };
  }
  if (m === 'POST' && p === '/api/suppliers/import-local') {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const updateDebt = b.options?.updateDebt !== false;
    const suppliers = getSuppliers(db);
    const byCode = new Map(suppliers.map((s) => [String(s.code || '').trim().toLowerCase(), s]));
    const byPhone = new Map(suppliers.filter((s) => s.phone).map((s) => [String(s.phone).trim(), s]));

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const lineErrors = [];
    for (const row of rows) {
      const rowNo = Number(row.__row) || 0;
      const code = String(row.code || '').trim();
      const name = String(row.name || '').trim();
      const phone = String(row.phone || '').trim();
      const email = String(row.email || '').trim();
      if (!name) {
        lineErrors.push({ row: rowNo, message: 'Thiếu tên nhà cung cấp' });
        skipped += 1;
        continue;
      }
      if (!phone && !email) {
        lineErrors.push({ row: rowNo, message: 'Cần ít nhất điện thoại hoặc email' });
        skipped += 1;
        continue;
      }
      const existing = (code ? byCode.get(code.toLowerCase()) : null) || (phone ? byPhone.get(phone) : null);
      if (existing) {
        const next = {
          ...existing,
          code: code || existing.code,
          name,
          phone: phone || existing.phone,
          email: email || existing.email,
          address: String(row.address || existing.address || '').trim(),
          area: String(row.area || existing.area || '').trim(),
          ward: String(row.ward || existing.ward || '').trim(),
          notes: String(row.notes || existing.notes || '').trim(),
          companyName: String(row.companyName || existing.companyName || '').trim(),
          taxCode: String(row.taxCode || existing.taxCode || '').trim(),
          group: String(row.group || existing.group || '').trim(),
          status: row.status === 'inactive' ? 'inactive' : (existing.status || 'active'),
          currentDebt: updateDebt && row.currentDebt != null ? (Number(row.currentDebt) || 0) : (Number(existing.currentDebt) || 0),
          updatedAt: Date.now(),
        };
        upsertKvNs(db, 'supplier', existing._id, next);
        updated += 1;
      } else {
        const _id = makeId('sup');
        const doc = {
          _id,
          code,
          name,
          phone,
          email,
          address: String(row.address || '').trim(),
          area: String(row.area || '').trim(),
          ward: String(row.ward || '').trim(),
          notes: String(row.notes || '').trim(),
          companyName: String(row.companyName || '').trim(),
          taxCode: String(row.taxCode || '').trim(),
          group: String(row.group || '').trim(),
          status: row.status === 'inactive' ? 'inactive' : 'active',
          currentDebt: updateDebt && row.currentDebt != null ? (Number(row.currentDebt) || 0) : 0,
          totalPurchase: 0,
          paidAmount: 0,
          purchaseCount: 0,
          totalImportedQty: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        upsertKvNs(db, 'supplier', _id, doc);
        if (doc.code) byCode.set(doc.code.toLowerCase(), doc);
        if (doc.phone) byPhone.set(doc.phone, doc);
        imported += 1;
      }
    }
    return {
      ok: true,
      imported,
      updated,
      skipped,
      lineErrors,
      message: `Da nhap ${imported} nha cung cap moi, cap nhat ${updated}, bo qua ${skipped}.`,
      errors: lineErrors,
    };
  }

  // Purchase orders
  if (m === 'GET' && p === '/api/purchase-orders') {
    const statusRaw = String(searchParams.get('status') || '').trim();
    const statuses = statusRaw ? new Set(statusRaw.split(',').map((s) => s.trim())) : null;
    const creatorId = String(searchParams.get('creatorId') || '').trim();
    const receiverId = String(searchParams.get('receiverId') || '').trim();
    const from = searchParams.get('dateFrom') ? new Date(`${searchParams.get('dateFrom')}T00:00:00`).getTime() : 0;
    const to = searchParams.get('dateTo') ? new Date(`${searchParams.get('dateTo')}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;
    const list = getPurchaseOrders(db).filter((o) => {
      if (statuses && !statuses.has(String(o.status || ''))) return false;
      const ts = normalizeTs(o.createdAt);
      if (ts < from || ts > to) return false;
      if (creatorId && String(o.creatorId || '') !== creatorId) return false;
      if (receiverId && String(o.receiverId || '') !== receiverId) return false;
      return true;
    });
    return { purchaseOrders: list };
  }
  if (m === 'POST' && p === '/api/purchase-orders') {
    const _id = makeId('po');
    const doc = {
      _id,
      code: nextPurchaseOrderCode(db),
      supplierId: b.supplierId || '',
      supplierCode: b.supplierCode || '',
      supplierName: b.supplierName || '',
      notes: b.notes || '',
      amountToPay: Number(b.amountToPay) || 0,
      amountPaid: Number(b.amountPaid) || 0,
      status: b.status || 'draft',
      items: Array.isArray(b.items) ? b.items : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    upsertKvNs(db, 'purchase_order', _id, doc);
    if (doc.status === 'received') {
      applyPurchaseOrderStockDelta(db, [], doc.items);
    }
    return { purchaseOrder: doc };
  }
  if (m === 'POST' && p === '/api/purchase-orders/import-local') {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const products = getProducts(db);
    const byCode = new Map(products.map((pItem) => [String(pItem.productCode || '').trim().toLowerCase(), pItem]));
    const validItems = [];
    const lineErrors = [];
    let createdProducts = 0;
    let linkedProducts = 0;
    for (const row of rows) {
      const rowNo = Number(row.__row) || 0;
      const code = String(row.productCode || '').trim();
      const name = String(row.productName || '').trim();
      const qty = Number(row.quantity) || 0;
      if (!code && !name && qty <= 0) continue;
      if (qty <= 0) {
        lineErrors.push({ row: rowNo, message: 'Số lượng phải lớn hơn 0' });
        continue;
      }
      let product = code ? byCode.get(code.toLowerCase()) : null;
      const wasExisting = Boolean(product);
      const unitPriceFromFile = Number(row.unitPrice) || 0;
      const quantity = qty || 1;
      const discount = Number(row.discount) || 0;
      if (!product) {
        const productCode = code || `SP${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const localId = makeId('p');
        product = {
          localId,
          _id: localId,
          productCode,
          name: name || productCode,
          barcode: String(row.barcode || '').trim(),
          unit: String(row.unit || 'Cái').trim() || 'Cái',
          price: unitPriceFromFile,
          costPrice: unitPriceFromFile,
          stock: 0,
          allowPoints: true,
          synced: true,
          deleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        putPosDoc(db, 'pos_products', localId, product);
        byCode.set(String(product.productCode || '').trim().toLowerCase(), product);
        createdProducts += 1;
      } else {
        linkedProducts += 1;
      }
      const unitPrice = Number(row.unitPrice) || Number(product.costPrice) || Number(product.price) || 0;
      const discountPercent = Number(row.discountPercent) || 0;
      validItems.push({
        productId: product._id || product.localId || '',
        productCode: product.productCode || code,
        productName: name || product.name || '',
        unit: String(row.unit || product.unit || 'Cái'),
        quantity,
        unitPrice,
        discount,
        discountPercent,
        amount: Math.max(0, Number(row.amount) || quantity * unitPrice - discount),
        note: String(row.note || '').trim(),
        stock: Number(product.stock) || 0,
        sellPrice: Number(product.price) || 0,
        costPrice: Number(product.costPrice) || 0,
        sourceRow: rowNo || null,
        importAction: wasExisting ? 'linked' : 'created',
      });
    }
    return { ok: true, validItems, lineErrors, summary: { createdProducts, linkedProducts, totalRows: validItems.length } };
  }
  if (m === 'POST' && p === '/api/purchase-orders/import-bulk-preview-local') {
    return { ok: false, message: 'Tính năng import file phiếu nhập đã được tắt.' };
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const lineErrors = [];
    const summary = {
      ordersInFile: 0,
      newOrders: 0,
      existingOrders: 0,
      linkedSuppliers: 0,
      createdSuppliers: 0,
      updatedProducts: 0,
      createdProducts: 0,
      estimatedAmountToPay: 0,
    };
    if (!rows.length) return { ok: true, summary, lineErrors };

    const suppliers = getSuppliers(db);
    const supplierByCode = new Map(
      suppliers
        .filter((s) => s.code)
        .map((s) => [String(s.code || '').trim().toLowerCase(), s]),
    );
    const supplierByPhone = new Map(
      suppliers
        .filter((s) => s.phone)
        .map((s) => [String(s.phone || '').trim(), s]),
    );

    const products = getProducts(db);
    const productByCode = new Map(
      products
        .filter((pItem) => pItem.productCode)
        .map((pItem) => [String(pItem.productCode || '').trim().toLowerCase(), pItem]),
    );
    const existingOrderCodeSet = new Set(
      getPurchaseOrders(db)
        .map((po) => String(po.code || '').trim().toLowerCase())
        .filter(Boolean),
    );
    const processedSupplierCodes = new Set();
    const processedSupplierPhones = new Set();
    const processedProductCodes = new Set();

    const grouped = new Map();
    rows.forEach((row) => {
      const code = String(row.orderCode || '').trim();
      if (!code) return;
      const arr = grouped.get(code) || [];
      arr.push(row);
      grouped.set(code, arr);
    });
    summary.ordersInFile = grouped.size;

    grouped.forEach((groupRows, orderCode) => {
      if (existingOrderCodeSet.has(orderCode.toLowerCase())) summary.existingOrders += 1;
      else summary.newOrders += 1;

      const first = groupRows[0] || {};
      const supplierCodeRaw = String(first.supplierCode || '').trim();
      const supplierPhoneRaw = String(first.supplierPhone || '').trim();
      const supplierNameRaw = String(first.supplierName || '').trim();
      const supplierByCodeFound = supplierCodeRaw ? supplierByCode.get(supplierCodeRaw.toLowerCase()) : null;
      const supplierByPhoneFound = supplierPhoneRaw ? supplierByPhone.get(supplierPhoneRaw) : null;
      if (supplierByCodeFound || supplierByPhoneFound) {
        if (
          (supplierCodeRaw && !processedSupplierCodes.has(supplierCodeRaw.toLowerCase())) ||
          (supplierPhoneRaw && !processedSupplierPhones.has(supplierPhoneRaw))
        ) {
          summary.linkedSuppliers += 1;
          if (supplierCodeRaw) processedSupplierCodes.add(supplierCodeRaw.toLowerCase());
          if (supplierPhoneRaw) processedSupplierPhones.add(supplierPhoneRaw);
        }
      } else if (supplierCodeRaw || supplierNameRaw || supplierPhoneRaw) {
        summary.createdSuppliers += 1;
        if (supplierCodeRaw) processedSupplierCodes.add(supplierCodeRaw.toLowerCase());
        if (supplierPhoneRaw) processedSupplierPhones.add(supplierPhoneRaw);
      }

      for (const row of groupRows) {
        const rowNo = Number(row.__row) || 0;
        const productCodeRaw = String(row.productCode || '').trim();
        const productNameRaw = String(row.productName || '').trim();
        const quantity = Math.max(0, Number(row.quantity) || 0);
        if (!productCodeRaw && !productNameRaw) continue;
        if (!quantity) {
          lineErrors.push({ row: rowNo, message: 'Số lượng hàng nhập không hợp lệ' });
          continue;
        }
        const unitPrice = Math.max(0, Number(row.unitPrice) || 0);
        const discount = Math.max(0, Number(row.discount) || 0);
        const amount = Math.max(0, Number(row.amount) || quantity * unitPrice - discount);
        summary.estimatedAmountToPay += amount;

        const productCodeKey = productCodeRaw.toLowerCase();
        if (!processedProductCodes.has(productCodeKey)) {
          if (productByCode.has(productCodeKey)) summary.updatedProducts += 1;
          else summary.createdProducts += 1;
          processedProductCodes.add(productCodeKey);
        }
      }
    });
    return { ok: true, summary, lineErrors };
  }
  if (m === 'POST' && p === '/api/purchase-orders/import-bulk-local') {
    return { ok: false, message: 'Tính năng import file phiếu nhập đã được tắt.' };
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const lineErrors = [];
    const summary = {
      importedOrders: 0,
      linkedSuppliers: 0,
      createdSuppliers: 0,
      updatedProducts: 0,
      createdProducts: 0,
    };
    const affectedOrderCodes = [];
    let affectedMinTs = 0;
    let affectedMaxTs = 0;
    if (!rows.length) return { ok: true, summary, lineErrors };

    const suppliers = getSuppliers(db);
    const supplierById = new Map(suppliers.map((s) => [String(s._id || '').trim(), s]));
    const supplierByCode = new Map(
      suppliers
        .filter((s) => s.code)
        .map((s) => [String(s.code || '').trim().toLowerCase(), s]),
    );
    const supplierByPhone = new Map(
      suppliers
        .filter((s) => s.phone)
        .map((s) => [String(s.phone || '').trim(), s]),
    );

    const products = getProducts(db);
    const productByCode = new Map(
      products
        .filter((pItem) => pItem.productCode)
        .map((pItem) => [String(pItem.productCode || '').trim().toLowerCase(), pItem]),
    );

    const grouped = new Map();
    rows.forEach((row) => {
      const code = String(row.orderCode || '').trim();
      if (!code) return;
      const arr = grouped.get(code) || [];
      arr.push(row);
      grouped.set(code, arr);
    });

    grouped.forEach((groupRows, orderCode) => {
      const first = groupRows[0] || {};
      const supplierCodeRaw = String(first.supplierCode || '').trim();
      const supplierNameRaw = String(first.supplierName || '').trim();
      const supplierPhoneRaw = String(first.supplierPhone || '').trim();
      let supplier = null;
      if (supplierCodeRaw) supplier = supplierByCode.get(supplierCodeRaw.toLowerCase()) || null;
      if (!supplier && supplierPhoneRaw) supplier = supplierByPhone.get(supplierPhoneRaw) || null;
      if (supplier) {
        summary.linkedSuppliers += 1;
      } else if (supplierNameRaw || supplierCodeRaw) {
        const sid = makeId('sup');
        supplier = {
          _id: sid,
          code: supplierCodeRaw || `NCC${String(Date.now()).slice(-6)}`,
          name: supplierNameRaw || 'Nhà cung cấp',
          phone: supplierPhoneRaw,
          email: '',
          address: '',
          area: '',
          ward: '',
          notes: '',
          companyName: '',
          taxCode: '',
          group: '',
          status: 'active',
          currentDebt: 0,
          totalPurchase: 0,
          paidAmount: 0,
          purchaseCount: 0,
          totalImportedQty: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        upsertKvNs(db, 'supplier', sid, supplier);
        supplierByCode.set(String(supplier.code || '').trim().toLowerCase(), supplier);
        if (supplier.phone) supplierByPhone.set(String(supplier.phone).trim(), supplier);
        summary.createdSuppliers += 1;
      }

      const items = [];
      let amountToPay = 0;
      const itemMap = new Map();
      for (const row of groupRows) {
        const rowNo = Number(row.__row) || 0;
        const productCodeRaw = String(row.productCode || '').trim();
        const productNameRaw = String(row.productName || '').trim();
        const quantity = Math.max(0, Number(row.quantity) || 0);
        if (!productCodeRaw && !productNameRaw) continue;
        if (!quantity) {
          lineErrors.push({ row: rowNo, message: 'Số lượng hàng nhập không hợp lệ' });
          continue;
        }

        let product = productByCode.get(productCodeRaw.toLowerCase()) || null;
        const unitPrice = Math.max(0, Number(row.unitPrice) || 0);
        const discount = Math.max(0, Number(row.discount) || 0);
        const amount = Math.max(0, Number(row.amount) || quantity * unitPrice - discount);

        if (!product) {
          const localId = String(row.localProductId || `p-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
          product = {
            localId,
            _id: localId,
            productCode: productCodeRaw || `SP${Date.now()}`,
            name: productNameRaw || productCodeRaw || 'Hàng hóa',
            barcode: String(row.barcode || '').trim(),
            unit: String(row.unit || 'Cái').trim() || 'Cái',
            price: unitPrice,
            costPrice: unitPrice,
            stock: quantity,
            allowPoints: true,
            synced: true,
            deleted: false,
            createdAt: first.createdAt || Date.now(),
            updatedAt: Date.now(),
          };
          putPosDoc(db, 'pos_products', localId, product);
          productByCode.set(String(product.productCode || '').trim().toLowerCase(), product);
          summary.createdProducts += 1;
        } else {
          const next = {
            ...product,
            name: productNameRaw || product.name || product.productCode,
            unit: String(row.unit || product.unit || 'Cái').trim() || 'Cái',
            costPrice: unitPrice || Number(product.costPrice) || 0,
            stock: (Number(product.stock) || 0) + quantity,
            updatedAt: Date.now(),
          };
          putPosDoc(db, 'pos_products', next.localId || next._id, next);
          productByCode.set(String(next.productCode || '').trim().toLowerCase(), next);
          product = next;
          summary.updatedProducts += 1;
        }

        amountToPay += amount;
        const itemKey = `${String(product.productCode || productCodeRaw).trim().toLowerCase()}__${unitPrice}__${discount}`;
        const existingItem = itemMap.get(itemKey);
        if (existingItem) {
          existingItem.quantity += quantity;
          existingItem.amount += amount;
          itemMap.set(itemKey, existingItem);
          continue;
        }
        itemMap.set(itemKey, {
          productId: product._id || product.localId || '',
          productCode: product.productCode || productCodeRaw,
          productName: productNameRaw || product.name || '',
          unit: String(row.unit || product.unit || 'Cái'),
          quantity,
          unitPrice,
          discount,
          amount,
          note: String(row.note || '').trim(),
        });
      }
      const mergedItems = Array.from(itemMap.values());
      const mergedQty = mergedItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

      const createdAt = normalizeTs(first.createdAt || first.time || Date.now()) || Date.now();
      const existing = getPurchaseOrders(db).find((po) => String(po.code || '').trim().toLowerCase() === orderCode.toLowerCase());
      const importCreatorName = String(first.creatorName || '').trim();
      const importReceiverName = String(first.receiverName || '').trim();
      const doc = existing
        ? {
            ...existing,
            supplierId: supplier?._id || existing.supplierId || '',
            supplierCode: supplier?.code || supplierCodeRaw || existing.supplierCode || '',
            supplierName: supplier?.name || supplierNameRaw || existing.supplierName || '',
            creatorName: importCreatorName || existing.creatorName || '',
            receiverName: importReceiverName || existing.receiverName || '',
            amountToPay,
            status: 'received',
            items: mergedItems,
            createdAt: normalizeTs(existing.createdAt) > 946684800000 ? normalizeTs(existing.createdAt) : Date.now(),
            updatedAt: Date.now(),
          }
        : {
            _id: makeId('po'),
            code: orderCode,
            supplierId: supplier?._id || '',
            supplierCode: supplier?.code || supplierCodeRaw || '',
            supplierName: supplier?.name || supplierNameRaw || '',
            creatorName: importCreatorName,
            receiverName: importReceiverName,
            notes: String(first.notes || '').trim(),
            amountToPay,
            amountPaid: 0,
            status: 'received',
            items: mergedItems,
            // Lưu thời gian tạo phiếu theo lúc import để không bị "mất" khỏi bộ lọc tháng hiện tại khi quay lại trang.
            createdAt: Date.now(),
            sourceCreatedAt: createdAt,
            updatedAt: Date.now(),
          };
      upsertKvNs(db, 'purchase_order', doc._id, doc);
      summary.importedOrders += 1;
      affectedOrderCodes.push(String(doc.code || '').trim());
      const docTs = normalizeTs(doc.createdAt || doc.updatedAt || Date.now());
      if (!affectedMinTs || (docTs && docTs < affectedMinTs)) affectedMinTs = docTs;
      if (!affectedMaxTs || docTs > affectedMaxTs) affectedMaxTs = docTs;

      const prevAmount = Number(existing?.amountToPay || 0);
      const prevQty = Array.isArray(existing?.items)
        ? existing.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
        : 0;
      const oldSupplierId = String(existing?.supplierId || '').trim();
      const newSupplierId = String(supplier?._id || '').trim();
      const sameSupplier = !existing || !oldSupplierId || oldSupplierId === newSupplierId;

      if (existing && oldSupplierId && !sameSupplier) {
        const oldSupplier = supplierById.get(oldSupplierId);
        if (oldSupplier) {
          const oldNext = {
            ...oldSupplier,
            currentDebt: Number(oldSupplier.currentDebt || 0) - prevAmount,
            totalPurchase: Number(oldSupplier.totalPurchase || 0) - prevAmount,
            purchaseCount: Math.max(0, Number(oldSupplier.purchaseCount || 0) - 1),
            totalImportedQty: Math.max(0, Number(oldSupplier.totalImportedQty || 0) - prevQty),
            updatedAt: Date.now(),
          };
          upsertKvNs(db, 'supplier', oldNext._id, oldNext);
          supplierById.set(String(oldNext._id || '').trim(), oldNext);
          supplierByCode.set(String(oldNext.code || '').trim().toLowerCase(), oldNext);
          if (oldNext.phone) supplierByPhone.set(String(oldNext.phone).trim(), oldNext);
        }
      }

      if (supplier) {
        const deltaAmount = existing ? (amountToPay - prevAmount) : amountToPay;
        const deltaQty = existing ? (mergedQty - prevQty) : mergedQty;
        const nextSupplier = {
          ...supplier,
          currentDebt: Number(supplier.currentDebt || 0) + deltaAmount,
          totalPurchase: Number(supplier.totalPurchase || 0) + deltaAmount,
          purchaseCount: Number(supplier.purchaseCount || 0) + (existing && sameSupplier ? 0 : 1),
          totalImportedQty: Number(supplier.totalImportedQty || 0) + deltaQty,
          updatedAt: Date.now(),
        };
        upsertKvNs(db, 'supplier', nextSupplier._id, nextSupplier);
        supplierById.set(String(nextSupplier._id || '').trim(), nextSupplier);
        supplierByCode.set(String(nextSupplier.code || '').trim().toLowerCase(), nextSupplier);
        if (nextSupplier.phone) supplierByPhone.set(String(nextSupplier.phone).trim(), nextSupplier);
      }
    });

    return {
      ok: true,
      summary,
      lineErrors,
      affectedOrderCodes,
      affectedMinTs,
      affectedMaxTs,
    };
  }
  if (/^\/api\/purchase-orders\/[^/]+$/.test(p)) {
    const _id = decodeURIComponent(p.split('/').pop());
    const cur = getPurchaseOrders(db).find((x) => String(x._id) === _id);
    if (m === 'GET') {
      if (!cur) return { purchaseOrder: null };
      return { purchaseOrder: cur };
    }
    if (m === 'PATCH') {
      if (!cur) return { ok: false };
      const alreadyCompleted = cur.status === 'received' && (b.status === 'received' || b.status == null);
      const next = {
        ...cur,
        ...b,
        _id,
        code: cur.code,
        amountToPay: b.amountToPay != null ? (Number(b.amountToPay) || 0) : (Number(cur.amountToPay) || 0),
        amountPaid: b.amountPaid != null ? (Number(b.amountPaid) || 0) : (Number(cur.amountPaid) || 0),
        items: Array.isArray(b.items) ? b.items : cur.items,
        updatedAt: Date.now(),
      };
      upsertKvNs(db, 'purchase_order', _id, next);
      const beforeReceivedItems = cur.status === 'received' ? cur.items : [];
      const afterReceivedItems = next.status === 'received' ? next.items : [];
      applyPurchaseOrderStockDelta(db, beforeReceivedItems, afterReceivedItems);
      return { purchaseOrder: next, alreadyCompleted };
    }
  }

  // Products
  if (m === 'GET' && p === '/api/products/lookup') {
    const idSet = new Set(
      String(searchParams.get('ids') || '')
        .split(',')
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    );
    const codeSet = new Set(
      String(searchParams.get('codes') || '')
        .split(',')
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean),
    );
    const products = getProducts(db).filter((pItem) => {
      const localId = String(pItem.localId || pItem._id || '').trim();
      const code = String(pItem.productCode || '').trim().toLowerCase();
      return (localId && idSet.has(localId)) || (code && codeSet.has(code));
    });
    return { products };
  }
  if (m === 'GET' && p === '/api/products') {
    const q = String(searchParams.get('q') || '').trim().toLowerCase();
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const usePaging = limitParam != null && String(limitParam).trim() !== '';
    const page = Math.max(1, Number(pageParam || 1));
    const limit = Math.max(1, Math.min(500, Number(limitParam || 100)));

    // Luồng search/paging ưu tiên query SQL để tránh parse toàn bộ dataset lớn.
    if (usePaging || q) {
      return searchProductsPaged(db, { q, page, limit });
    }

    const all = getProducts(db)
      .filter((pItem) => {
        if (!q) return true;
        const text = `${pItem.name || ''} ${pItem.productCode || ''} ${pItem.barcode || ''}`.toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => normalizeTs(b.updatedAt || b.createdAt) - normalizeTs(a.updatedAt || a.createdAt));

    if (!usePaging) return { products: all };
    const start = (page - 1) * limit;
    return {
      products: all.slice(start, start + limit),
      total: all.length,
      page,
      limit,
    };
  }
  if (m === 'GET' && p === '/api/products/check-code') {
    const code = String(searchParams.get('code') || '').trim().toLowerCase();
    const exists = getProducts(db).some((x) => String(x.productCode || '').toLowerCase() === code);
    return { exists };
  }
  if (m === 'GET' && (p === '/api/products/next-code' || p === '/api/products/next-codes')) {
    const count = Math.max(1, Math.min(100, Number(searchParams.get('count') || 1)));
    const products = getProducts(db);
    let maxNum = 0;
    for (const item of products) {
      const match = String(item.productCode || '').match(/^SP(\d+)$/i);
      if (match) maxNum = Math.max(maxNum, Number(match[1]) || 0);
    }
    const codes = Array.from({ length: count }, (_, idx) => `SP${String(maxNum + idx + 1).padStart(6, '0')}`);
    if (p === '/api/products/next-code') return { code: codes[0] };
    return { codes };
  }
  if (m === 'POST' && p === '/api/products') {
    const products = Array.isArray(b.products) ? b.products : [];
    const now = Date.now();
    for (const item of products) {
      const localId = String(item.localId || item._id || makeId('p'));
      const doc = { ...item, localId, _id: localId, updatedAt: item.updatedAt || now, createdAt: item.createdAt || now, synced: true };
      putPosDoc(db, 'pos_products', localId, doc);
      upsertKvNs(db, 'product', localId, doc);
    }
    return { ok: true, imported: products.length };
  }
  if (m === 'POST' && p === '/api/products/import-local') {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const options = b.importOptions || {};
    const duplicateCodeMode = String(options.duplicateCodeName || 'error');
    const duplicateBarcodeMode = String(options.duplicateBarcodeCode || 'error');
    const updateStock = Boolean(options.updateStock);
    const updateCost = Boolean(options.updateCost);

    const allProducts = getProducts(db);
    const byCode = new Map(allProducts.map((x) => [String(x.productCode || '').toLowerCase(), x]));
    const byBarcode = new Map(
      allProducts.filter((x) => x.barcode).map((x) => [String(x.barcode || '').toLowerCase(), x]),
    );

    const categories = listKvNs(db, 'category');
    const brands = listKvNs(db, 'brand');
    const categoryByName = new Map(categories.map((x) => [String(x.name || '').trim().toLowerCase(), x]));
    const brandByName = new Map(brands.map((x) => [String(x.name || '').trim().toLowerCase(), x]));

    let maxCodeNum = 0;
    for (const pItem of allProducts) {
      const mCode = String(pItem.productCode || '').match(/^SP(\d+)$/i);
      if (mCode) maxCodeNum = Math.max(maxCodeNum, Number(mCode[1]) || 0);
    }
    const nextCode = () => {
      maxCodeNum += 1;
      return `SP${String(maxCodeNum).padStart(6, '0')}`;
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const lineErrors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      const name = String(row.name || '').trim();
      const rowNo = Number(row.__row) || i + 2;
      if (!name) {
        skipped += 1;
        lineErrors.push({ row: rowNo, message: 'Thiếu tên hàng' });
        continue;
      }

      let code = String(row.productCode || '').trim();
      if (!code) code = nextCode();
      const codeKey = code.toLowerCase();
      const barcode = String(row.barcode || '').trim();
      const barcodeKey = barcode.toLowerCase();

      const categoryName = String(row.category || '').trim();
      let categoryId = '';
      if (categoryName) {
        const key = categoryName.toLowerCase();
        let cat = categoryByName.get(key);
        if (!cat) {
          const _id = makeId('cat');
          cat = { _id, name: categoryName, parentId: '' };
          upsertKvNs(db, 'category', _id, cat);
          categoryByName.set(key, cat);
        }
        categoryId = cat._id;
      }

      const brandName = String(row.brand || '').trim();
      let brandId = '';
      if (brandName) {
        const key = brandName.toLowerCase();
        let br = brandByName.get(key);
        if (!br) {
          const _id = makeId('brand');
          br = { _id, name: brandName };
          upsertKvNs(db, 'brand', _id, br);
          brandByName.set(key, br);
        }
        brandId = br._id;
      }

      const codeHit = byCode.get(codeKey);
      const barcodeHit = barcodeKey ? byBarcode.get(barcodeKey) : null;
      let target = codeHit || null;

      if (!target && barcodeHit) {
        if (duplicateBarcodeMode === 'skip') {
          skipped += 1;
          lineErrors.push({ row: rowNo, message: 'Trùng mã vạch, đã bỏ qua' });
          continue;
        }
        target = barcodeHit;
      }

      if (target) {
        if (codeHit && duplicateCodeMode === 'skip') {
          skipped += 1;
          lineErrors.push({ row: rowNo, message: 'Trùng mã hàng, đã bỏ qua' });
          continue;
        }
        const next = {
          ...target,
          name,
          barcode: barcode || target.barcode || '',
          categoryId: categoryId || target.categoryId || '',
          brandId: brandId || target.brandId || '',
          price: Number(row.price) || 0,
          localId: target.localId,
          _id: target.localId,
          synced: true,
          updatedAt: Date.now(),
        };
        if (updateCost) next.costPrice = Number(row.costPrice) || Number(row.cost) || 0;
        if (updateStock) next.stock = Number(row.stock) || 0;
        putPosDoc(db, 'pos_products', target.localId, next);
        upsertKvNs(db, 'product', target.localId, next);
        byCode.set(codeKey, next);
        if (barcodeKey) byBarcode.set(barcodeKey, next);
        updated += 1;
      } else {
        const localId = makeId('p');
        const doc = {
          localId,
          _id: localId,
          productCode: code,
          name,
          barcode,
          categoryId,
          brandId,
          price: Number(row.price) || 0,
          costPrice: Number(row.costPrice) || Number(row.cost) || 0,
          stock: Number(row.stock) || 0,
          unit: String(row.unit || 'cai').trim() || 'cai',
          allowPoints: true,
          deleted: false,
          synced: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        putPosDoc(db, 'pos_products', localId, doc);
        upsertKvNs(db, 'product', localId, doc);
        byCode.set(codeKey, doc);
        if (barcodeKey) byBarcode.set(barcodeKey, doc);
        created += 1;
      }
    }

    return {
      ok: true,
      imported: created + updated,
      created,
      updated,
      skipped,
      lineErrors,
      errors: lineErrors,
      message: `Da import ${created + updated} san pham (tao moi ${created}, cap nhat ${updated}, bo qua ${skipped}).`,
    };
  }
  if (m === 'DELETE' && /^\/api\/products\/[^/]+$/.test(p)) {
    const id = decodeURIComponent(p.split('/').pop());
    const all = getProducts(db);
    const target = all.find((x) => String(x.localId) === id || String(x._id) === id || String(x.productCode) === id);
    if (!target) return { ok: true };
    deletePosDoc(db, 'pos_products', target.localId);
    db.prepare(`DELETE FROM kv_store WHERE ns = 'product' AND k = ?`).run(target.localId);
    return { ok: true };
  }

  // Categories / brands for admin products page
  if (m === 'GET' && p === '/api/categories') return { categories: listKvNs(db, 'category') };
  if (m === 'POST' && p === '/api/categories') {
    const _id = String(b._id || makeId('cat'));
    const doc = { _id, name: String(b.name || '').trim(), parentId: String(b.parentId || '') };
    upsertKvNs(db, 'category', _id, doc);
    return { category: doc };
  }
  if (m === 'GET' && p === '/api/brands') return { brands: listKvNs(db, 'brand') };
  if (m === 'POST' && p === '/api/brands') {
    const _id = String(b._id || makeId('brand'));
    const doc = { _id, name: String(b.name || '').trim() };
    upsertKvNs(db, 'brand', _id, doc);
    return { brand: doc };
  }

  if (m === 'GET' && p === '/api/settings/customer-loyalty') {
    return { settings: getCustomerLoyaltySettings(db) };
  }
  if (m === 'POST' && p === '/api/settings/customer-loyalty') {
    const current = getCustomerLoyaltySettings(db);
    const next = {
      ...current,
      ...b,
      _id: CUSTOMER_LOYALTY_SETTINGS_KEY,
      earningMethod: String(b.earningMethod || current.earningMethod || 'order') === 'product' ? 'product' : 'order',
      earningAmount: Math.max(1, Number(b.earningAmount ?? current.earningAmount) || 100000),
      earningPoints: Math.max(1, Number(b.earningPoints ?? current.earningPoints) || 1),
      redeemPoints: Math.max(1, Number(b.redeemPoints ?? current.redeemPoints) || 1),
      redeemAmount: Math.max(1, Number(b.redeemAmount ?? current.redeemAmount) || 1000),
      minOrdersBeforeRedeem: Math.max(0, Number(b.minOrdersBeforeRedeem ?? current.minOrdersBeforeRedeem) || 0),
      enabled: b.enabled == null ? Boolean(current.enabled) : Boolean(b.enabled),
      allowPointPayment: b.allowPointPayment == null ? Boolean(current.allowPointPayment) : Boolean(b.allowPointPayment),
      allowEarnOnDiscountedItem:
        b.allowEarnOnDiscountedItem == null
          ? Boolean(current.allowEarnOnDiscountedItem)
          : Boolean(b.allowEarnOnDiscountedItem),
      allowEarnOnDiscountedOrder:
        b.allowEarnOnDiscountedOrder == null
          ? Boolean(current.allowEarnOnDiscountedOrder)
          : Boolean(b.allowEarnOnDiscountedOrder),
      allowEarnWhenPayingByPoints:
        b.allowEarnWhenPayingByPoints == null
          ? Boolean(current.allowEarnWhenPayingByPoints)
          : Boolean(b.allowEarnWhenPayingByPoints),
      allowEarnWhenPayingByVoucher:
        b.allowEarnWhenPayingByVoucher == null
          ? Boolean(current.allowEarnWhenPayingByVoucher)
          : Boolean(b.allowEarnWhenPayingByVoucher),
      enablePromotion: b.enablePromotion == null ? Boolean(current.enablePromotion) : Boolean(b.enablePromotion),
      enableVoucher: b.enableVoucher == null ? Boolean(current.enableVoucher) : Boolean(b.enableVoucher),
      enableCoupon: b.enableCoupon == null ? Boolean(current.enableCoupon) : Boolean(b.enableCoupon),
      updatedAt: Date.now(),
    };
    upsertKvNs(db, 'setting', CUSTOMER_LOYALTY_SETTINGS_KEY, next);
    return { settings: next };
  }
  if (m === 'GET' && p === '/api/data-cleanup/history') {
    return { items: getDataCleanupHistory(db) };
  }
  if (m === 'DELETE' && /^\/api\/data-cleanup\/history\/[^/]+$/.test(p)) {
    const id = decodeURIComponent(p.split('/').pop());
    const current = getDataCleanupHistory(db);
    const next = current.filter((item) => String(item.id || '') !== String(id));
    saveDataCleanupHistory(db, next);
    return { ok: true };
  }
  if (m === 'DELETE' && p === '/api/data-cleanup/history') {
    saveDataCleanupHistory(db, []);
    return { ok: true };
  }
  if (m === 'GET' && p === '/api/data-cleanup/schedules') {
    const schedules = processDueCleanupSchedules(db);
    return { items: schedules };
  }
  if (m === 'POST' && p === '/api/data-cleanup/schedules') {
    const mode = String(b.mode || 'full');
    const runAt = String(b.runAt || '').trim();
    if (!runAt) return { __error: true, status: 400, message: 'Thieu thoi gian chay lich xoa' };
    const schedule = {
      id: `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      runAt,
      payload: {
        mode,
        periodType: b.periodType || 'day',
        date: b.date || '',
        month: b.month || '',
        quarter: b.quarter || '',
        year: b.year || '',
        lunarYear: b.lunarYear || '',
        dateFrom: b.dateFrom || '',
        dateTo: b.dateTo || '',
      },
    };
    const current = getDataCleanupSchedules(db);
    current.unshift(schedule);
    saveDataCleanupSchedules(db, current.slice(0, 200));
    return { ok: true, schedule };
  }
  if (m === 'POST' && p === '/api/data-cleanup/execute') {
    const summary = runDataCleanup(db, b || {});
    return { ok: true, summary };
  }

  // Customers and related details
  if (m === 'GET' && p === '/api/customers/search-lite') {
    const qRaw = String(searchParams.get('q') || '').trim();
    const q = qRaw.toLowerCase();
    const limit = Math.max(1, Math.min(80, Number(searchParams.get('limit') || 20)));
    if (!q) return { items: [] };

    try {
      const likeAny = `%${q}%`;
      const likePrefix = `${q}%`;
      const rows = db
        .prepare(
          `SELECT local_id, doc
           FROM pos_customers
           WHERE lower(coalesce(json_extract(doc, '$.name'), json_extract(doc, '$.fullName'), '')) LIKE ?
              OR lower(coalesce(json_extract(doc, '$.phone'), '')) LIKE ?
              OR lower(coalesce(json_extract(doc, '$.customerCode'), '')) LIKE ?
           ORDER BY
             CASE WHEN lower(coalesce(json_extract(doc, '$.phone'), '')) = ? THEN 0 ELSE 1 END,
             CASE WHEN lower(coalesce(json_extract(doc, '$.phone'), '')) LIKE ? THEN 0 ELSE 1 END,
             CASE WHEN lower(coalesce(json_extract(doc, '$.name'), json_extract(doc, '$.fullName'), '')) LIKE ? THEN 0 ELSE 1 END,
             local_id DESC
           LIMIT ?`,
        )
        .all(likeAny, likeAny, likeAny, q, likePrefix, likePrefix, limit);

      const items = rows
        .map((row) => {
          const c = safeJson(row.doc, null);
          if (!c || isWalkInCustomer(c)) return null;
          return {
            localId: c.localId || row.local_id,
            customerCode: c.customerCode || '',
            name: c.name || c.fullName || '',
            fullName: c.fullName || c.name || '',
            nickname: c.nickname || '',
            phone: c.phone || '',
            points: Number(c.points) || 0,
            debt: Number(c.debt) || 0,
          };
        })
        .filter(Boolean);

      return { items };
    } catch {
      const items = getCustomers(db)
        .filter((c) => !isWalkInCustomer(c))
        .filter((c) => {
          const text = `${c.customerCode || ''} ${c.name || ''} ${c.fullName || ''} ${c.phone || ''}`.toLowerCase();
          return text.includes(q);
        })
        .slice(0, limit)
        .map((c) => ({
          localId: c.localId,
          customerCode: c.customerCode || '',
          name: c.name || c.fullName || '',
          fullName: c.fullName || c.name || '',
          nickname: c.nickname || '',
          phone: c.phone || '',
          points: Number(c.points) || 0,
          debt: Number(c.debt) || 0,
        }));
      return { items };
    }
  }

  if (m === 'GET' && p === '/api/customers') {
    const orders = getOrders(db);
    const returns = getReturns(db);
    const q = String(searchParams.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.max(1, Number(searchParams.get('limit') || 20));
    const customers = getCustomers(db)
      .filter((c) => !isWalkInCustomer(c))
      .map((c) => {
      const metrics = computeCustomerMetrics(c, orders, returns);
      return {
        ...c,
        customerCode: c.customerCode || c.code || c.localId,
        totalSales: metrics.totalSales,
        totalReturns: metrics.totalReturns,
        netSales: metrics.netSales,
        debt: metrics.debt,
        points: metrics.points,
      };
      });
    const filtered = customers.filter((c) => {
      if (q) {
        const text = `${c.customerCode || ''} ${c.name || ''} ${c.phone || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      const group = String(searchParams.get('group') || '').trim();
      const area = String(searchParams.get('area') || '').trim();
      if (group && String(c.group || '').trim() !== group) return false;
      if (area && String(c.area || '').trim() !== area) return false;
      const pointsMin = searchParams.get('pointsMin');
      const pointsMax = searchParams.get('pointsMax');
      const debtMin = searchParams.get('debtMin');
      const debtMax = searchParams.get('debtMax');
      if (debtMin != null && debtMin !== '' && Number(c.debt || 0) < Number(debtMin)) return false;
      if (debtMax != null && debtMax !== '' && Number(c.debt || 0) > Number(debtMax)) return false;
      if (pointsMin != null && pointsMin !== '' && Number(c.points || 0) < Number(pointsMin)) return false;
      if (pointsMax != null && pointsMax !== '' && Number(c.points || 0) > Number(pointsMax)) return false;
      const createdFrom = searchParams.get('createdFrom');
      const createdTo = searchParams.get('createdTo');
      if (createdFrom || createdTo) {
        const ts = normalizeTs(c.createdAt || c.updatedAt || 0);
        if (createdFrom) {
          const fromTs = Date.parse(`${createdFrom}T00:00:00`);
          if (Number.isFinite(fromTs) && ts < fromTs) return false;
        }
        if (createdTo) {
          const toTs = Date.parse(`${createdTo}T23:59:59.999`);
          if (Number.isFinite(toTs) && ts > toTs) return false;
        }
      }
      return true;
    });
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    const pageSumDebt = items.reduce((s, c) => s + (Number(c.debt) || 0), 0);
    const pageSumPoints = items.reduce((s, c) => s + (Number(c.points) || 0), 0);
    const pageSumSales = items.reduce((s, c) => s + (Number(c.totalSales) || 0), 0);
    const pageSumNet = items.reduce((s, c) => s + (Number(c.netSales) || 0), 0);
    const summary = {
      totalCustomers: filtered.length,
      totalDebt: filtered.reduce((s, c) => s + (Number(c.debt) || 0), 0),
      totalPoints: filtered.reduce((s, c) => s + (Number(c.points) || 0), 0),
      pageSumDebt,
      pageSumPoints,
      pageSumSales,
      pageSumNet,
    };
    return { items, total: filtered.length, summary };
  }
  if (m === 'POST' && p === '/api/customers') {
    const all = getCustomers(db);
    const localId = String(b.localId || b._id || makeId('c'));
    const customerCode = String(b.customerCode || `KH${String(all.length + 1).padStart(6, '0')}`);
    const now = Date.now();
    const doc = {
      localId,
      _id: localId,
      customerCode,
      name: String(b.name || b.fullName || '').trim() || 'Khach hang',
      fullName: String(b.name || b.fullName || '').trim() || 'Khach hang',
      phone: String(b.phone || '').trim(),
      address: String(b.address || '').trim(),
      group: String(b.group || '').trim(),
      points: Number(b.points) || 0,
      debt: Number(b.debt) || 0,
      createdAt: now,
      updatedAt: now,
      synced: true,
    };
    putPosDoc(db, 'pos_customers', localId, doc);
    return { customer: doc };
  }
  if (m === 'POST' && p === '/api/customers/import-local') {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const options = b.options || {};
    const updateDebt = options.updateDebt !== false;
    const updatePoints = options.updatePoints !== false;
    const allowDuplicateEmail = Boolean(options.allowDuplicateEmail);
    const updateOnDuplicateEmail = Boolean(options.updateOnDuplicateEmail);
    const updateOnDuplicatePhone = Boolean(options.updateOnDuplicatePhone);

    const customers = getCustomers(db);
    const byCode = new Map(customers.map((c) => [String(c.customerCode || '').trim().toLowerCase(), c]));
    const byPhone = new Map(customers.filter((c) => c.phone).map((c) => [String(c.phone).trim(), c]));
    const byEmail = new Map(
      customers
        .filter((c) => c.email)
        .map((c) => [String(c.email || '').trim().toLowerCase(), c]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let skippedDuplicateEmail = 0;
    let skippedDuplicatePhone = 0;
    const lineErrors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      const name = String(row.name || '').trim();
      const phone = String(row.phone || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      let code = String(row.customerCode || '').trim();
      const rowNo = Number(row.__row) || i + 2;
      if (!name && !phone) {
        skipped += 1;
        lineErrors.push({ row: rowNo, message: 'Thiếu tên hoặc số điện thoại' });
        continue;
      }
      if (!code) code = `KH${String(customers.length + created + updated + 1).padStart(6, '0')}`;

      const codeKey = code.toLowerCase();
      let target = byCode.get(codeKey) || null;
      if (!target && phone && byPhone.get(phone)) {
        if (updateOnDuplicatePhone) {
          target = byPhone.get(phone);
        } else {
          skipped += 1;
          skippedDuplicatePhone += 1;
          lineErrors.push({ row: rowNo, message: 'Trùng số điện thoại, đã bỏ qua' });
          continue;
        }
      }
      if (!target && email && byEmail.get(email)) {
        if (updateOnDuplicateEmail) {
          target = byEmail.get(email);
        } else if (!allowDuplicateEmail) {
          skipped += 1;
          skippedDuplicateEmail += 1;
          lineErrors.push({ row: rowNo, message: 'Trùng email, đã bỏ qua' });
          continue;
        }
      }

      if (target) {
        const next = {
          ...target,
          localId: target.localId,
          _id: target.localId,
          customerCode: target.customerCode || code,
          name: name || target.name || '',
          fullName: name || target.fullName || target.name || '',
          phone: phone || target.phone || '',
          email: email || target.email || '',
          address: String(row.address || target.address || '').trim(),
          group: String(row.group || target.group || '').trim(),
          area: String(row.area || target.area || '').trim(),
          ward: String(row.ward || target.ward || '').trim(),
          updatedAt: Date.now(),
          synced: true,
        };
        if (updateDebt) next.debt = Number(row.debt) || 0;
        if (updatePoints) next.points = Number(row.points) || 0;
        putPosDoc(db, 'pos_customers', target.localId, next);
        byCode.set(String(next.customerCode || '').toLowerCase(), next);
        if (next.phone) byPhone.set(next.phone, next);
        if (next.email) byEmail.set(String(next.email).toLowerCase(), next);
        updated += 1;
      } else {
        const localId = makeId('c');
        const doc = {
          localId,
          _id: localId,
          customerCode: code,
          name: name || `Khach ${phone || localId.slice(-4)}`,
          fullName: name || `Khach ${phone || localId.slice(-4)}`,
          phone,
          email,
          address: String(row.address || '').trim(),
          group: String(row.group || '').trim(),
          area: String(row.area || '').trim(),
          ward: String(row.ward || '').trim(),
          debt: updateDebt ? (Number(row.debt) || 0) : 0,
          points: updatePoints ? (Number(row.points) || 0) : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          synced: true,
        };
        putPosDoc(db, 'pos_customers', localId, doc);
        byCode.set(codeKey, doc);
        if (phone) byPhone.set(phone, doc);
        if (email) byEmail.set(email, doc);
        created += 1;
      }
    }

    return {
      ok: true,
      created,
      updated,
      skipped,
      skippedDuplicateEmail,
      skippedDuplicatePhone,
      message: `Import xong: tao ${created}, cap nhat ${updated}, bo qua ${skipped}.`,
      lineErrors,
      errors: lineErrors,
    };
  }
  if (m === 'GET' && /^\/api\/customers\/[^/]+\/orders$/.test(p)) {
    const id = decodeURIComponent(p.split('/')[3]);
    const customer = getCustomers(db).find((x) => String(x._id) === id || String(x.localId) === id);
    if (!customer) return [];
    const metrics = computeCustomerMetrics(customer, getOrders(db), getReturns(db));
    return metrics.orders;
  }
  if (m === 'GET' && /^\/api\/customers\/[^/]+\/returns$/.test(p)) {
    const id = decodeURIComponent(p.split('/')[3]);
    const customer = getCustomers(db).find((x) => String(x._id) === id || String(x.localId) === id);
    if (!customer) return [];
    const metrics = computeCustomerMetrics(customer, getOrders(db), getReturns(db));
    return metrics.returns;
  }
  if (m === 'GET' && /^\/api\/customers\/[^/]+\/ledger$/.test(p)) {
    const id = decodeURIComponent(p.split('/')[3]);
    const customer = getCustomers(db).find((x) => String(x._id) === id || String(x.localId) === id);
    if (!customer) return [];
    const metrics = computeCustomerMetrics(customer, getOrders(db), getReturns(db));
    const ledger = [];
    for (const o of metrics.orders) {
      ledger.push({ code: o.orderCode || o.localId, time: o.createdAt, type: 'Hoa don', value: Number(o.totalAmount) || 0 });
    }
    for (const r of metrics.returns) {
      ledger.push({ code: r.returnCode || r.localId, time: r.createdAt, type: 'Tra hang', value: -(Number(r.totalReturnAmount) || 0) });
    }
    ledger.sort((a, b) => normalizeTs(a.time) - normalizeTs(b.time));
    let balance = 0;
    return ledger.map((row) => {
      balance += Number(row.value) || 0;
      return { ...row, balance };
    });
  }
  if (m === 'GET' && /^\/api\/customers\/[^/]+\/points-history$/.test(p)) {
    const id = decodeURIComponent(p.split('/')[3]);
    const customer = getCustomers(db).find((x) => String(x._id) === id || String(x.localId) === id);
    if (!customer) return [];
    const metrics = computeCustomerMetrics(customer, getOrders(db), getReturns(db));
    const rows = [];
    let balanceAfter = 0;
    const sortedOrders = [...metrics.orders].sort((a, b) => normalizeTs(a.createdAt) - normalizeTs(b.createdAt));
    for (const o of sortedOrders) {
      const orderTotal = Number(o.totalAmount) || 0;
      const pointsDelta = Number(o.pointsEarned) || Math.round(orderTotal / 50000);
      balanceAfter += pointsDelta;
      rows.push({ code: o.orderCode || o.localId, time: o.createdAt, type: 'Mua hang', orderTotal, pointsDelta, balanceAfter });
    }
    return rows;
  }

  // Orders and returns for invoices/admin
  if (m === 'GET' && p === '/api/orders') {
    const orders = getOrders(db);
    const returns = getReturns(db);
    const customers = getCustomers(db);
    const customerById = new Map(customers.map((c) => [String(c.localId), c]));
    const returnCodesByOrderLocalId = new Map();
    const returnCodesByOrderCode = new Map();
    for (const r of returns) {
      const code = String(r.returnCode || r.localId || '').trim();
      if (!code) continue;
      const orderLocalId = String(r.orderLocalId || '').trim();
      const orderCode = String(r.orderCode || '').trim();
      if (orderLocalId) {
        const list = returnCodesByOrderLocalId.get(orderLocalId) || [];
        if (!list.includes(code)) list.push(code);
        returnCodesByOrderLocalId.set(orderLocalId, list);
      }
      if (orderCode) {
        const list = returnCodesByOrderCode.get(orderCode) || [];
        if (!list.includes(code)) list.push(code);
        returnCodesByOrderCode.set(orderCode, list);
      }
    }
    const statusRaw = String(searchParams.get('status') || '').trim();
    const statusSet = statusRaw ? new Set(statusRaw.split(',').map((s) => s.trim())) : null;
    const term = String(searchParams.get('search') || '').trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.max(1, Number(searchParams.get('limit') || 100));
    const filterByPeriod = buildPeriodFilter(searchParams);

    const result = orders
      .map((o) => {
        const c = customerById.get(String(o.customerLocalId || ''));
        const byLocal = returnCodesByOrderLocalId.get(String(o.localId || '')) || [];
        const byCode = returnCodesByOrderCode.get(String(o.orderCode || '')) || [];
        const returnCodes = Array.from(new Set([...byLocal, ...byCode]));
        return {
          ...o,
          _id: o.localId,
          customerName: o.customerName || o.customerLabel || c?.name || '',
          customerCode: o.customerCode || c?.customerCode || '',
          status: o.status || 'completed',
          returnCodes,
        };
      })
      .filter((o) => {
        if (statusSet && !statusSet.has(String(o.status || ''))) return false;
        if (!filterByPeriod(normalizeTs(o.createdAt))) return false;
        if (term) {
          const text = `${o.orderCode || ''} ${o.localId || ''} ${o.customerName || ''}`.toLowerCase();
          if (!text.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => normalizeTs(b.createdAt) - normalizeTs(a.createdAt));

    const start = (page - 1) * limit;
    return { orders: result.slice(start, start + limit), total: result.length, page, limit };
  }

  if (m === 'GET' && p === '/api/returns') {
    const returns = getReturns(db);
    const orders = getOrders(db);
    const orderByLocalId = new Map(orders.map((o) => [String(o.localId || ''), o]));
    const orderByCode = new Map(orders.map((o) => [String(o.orderCode || ''), o]));
    const returnItemsByReturnId = computeReturnItemsByReturnId(db);
    const statusRaw = String(searchParams.get('status') || '').trim();
    const statusSet = statusRaw ? new Set(statusRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) : null;
    const typeRaw = String(searchParams.get('type') || '').trim();
    const typeSet = typeRaw ? new Set(typeRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) : null;
    const creator = String(searchParams.get('creator') || '').trim().toLowerCase();
    const receiver = String(searchParams.get('receiver') || '').trim().toLowerCase();
    const term = String(searchParams.get('search') || '').trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.max(1, Number(searchParams.get('limit') || 50));
    const filterByPeriod = buildPeriodFilter(searchParams);

    const result = returns
      .map((r) => {
        const linkedOrder =
          orderByLocalId.get(String(r.orderLocalId || '')) ||
          orderByCode.get(String(r.orderCode || '')) ||
          null;
        const returnItems = returnItemsByReturnId.get(r.localId) || [];
        const exchangeItems = Array.isArray(r.exchangeItems) ? r.exchangeItems : [];
        const totalReturnAmount = Number(r.totalReturnAmount) || returnItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
        const totalExchangeAmount =
          Number(r.totalExchangeAmount) ||
          exchangeItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
        const invoiceType = r.exchangeOrderCode || exchangeItems.length > 0 ? 'exchange' : 'return';
        const status = String(r.status || 'completed').toLowerCase();
        return {
          ...r,
          _id: r.localId,
          returnCode: r.returnCode || r.localId,
          orderCode: r.orderCode || linkedOrder?.orderCode || '',
          customerName: r.customerName || linkedOrder?.customerName || '',
          cashierName: r.cashierName || linkedOrder?.cashierName || '',
          receiverName: r.receiverName || r.receivedBy || '',
          invoiceType,
          status,
          totalReturnAmount,
          totalExchangeAmount,
          amountDelta: totalExchangeAmount - totalReturnAmount,
          itemsCount: returnItems.length,
          returnItems,
          exchangeItems,
        };
      })
      .filter((r) => {
        if (!filterByPeriod(normalizeTs(r.createdAt))) return false;
        if (statusSet && !statusSet.has(String(r.status || '').toLowerCase())) return false;
        if (typeSet && !typeSet.has(String(r.invoiceType || '').toLowerCase())) return false;
        if (creator) {
          const c = String(r.cashierName || '').toLowerCase();
          if (!c.includes(creator)) return false;
        }
        if (receiver) {
          const rv = String(r.receiverName || '').toLowerCase();
          if (!rv.includes(receiver)) return false;
        }
        if (term) {
          const text = `${r.returnCode || ''} ${r.localId || ''} ${r.orderCode || ''} ${r.customerName || ''}`.toLowerCase();
          if (!text.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => normalizeTs(b.createdAt) - normalizeTs(a.createdAt));

    const start = (page - 1) * limit;
    return { returns: result.slice(start, start + limit), total: result.length, page, limit };
  }

  const replaceOrder = p.match(/^\/api\/orders\/(.+)\/replace$/);
  if (m === 'POST' && replaceOrder) {
    const id = decodeURIComponent(replaceOrder[1]);
    const localId = String(b.localId || id);
    const existing = getOrders(db).find((o) => String(o.localId) === localId || String(o.orderCode) === id);
    const order = {
      ...(existing || {}),
      localId,
      _id: localId,
      orderCode: b.orderCode || existing?.orderCode || '',
      totalAmount: Number(b.totalAmount) || 0,
      subtotalAmount: Number(b.subtotalAmount) || 0,
      discount: Number(b.discount) || 0,
      discountType: b.discountType || existing?.discountType || 'amount',
      paymentMethod: b.paymentMethod || existing?.paymentMethod || 'cash',
      customerLocalId: b.customerLocalId || existing?.customerLocalId || '',
      customerPhone: b.customerPhone || existing?.customerPhone || '',
      note: b.note || '',
      status: existing?.status || 'completed',
      updatedAt: Date.now(),
    };
    putPosDoc(db, 'pos_orders', localId, order);
    db.prepare('DELETE FROM pos_order_items WHERE order_local_id = ?').run(localId);
    const items = Array.isArray(b.items) ? b.items : [];
    const ins = db.prepare('INSERT INTO pos_order_items (order_local_id, doc) VALUES (?, ?)');
    for (const item of items) ins.run(localId, JSON.stringify({ ...item, orderLocalId: localId }));
    return { ok: true };
  }

  const orderMatch = p.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch) {
    const id = decodeURIComponent(orderMatch[1]);
    const orders = getOrders(db);
    const returns = getReturns(db);
    const order = orders.find((o) => String(o.localId) === id || String(o.orderCode) === id || String(o._id) === id);
    if (order) {
      if (m === 'GET') {
        const normalizeProductKey = (value) => String(value || '').trim().replace(/_/g, '-').toLowerCase();
        const productMap = new Map();
        const productByName = new Map();
        getProducts(db).forEach((pItem) => {
          const keys = [pItem.localId, pItem._id, pItem.productCode]
            .filter(Boolean)
            .map((k) => normalizeProductKey(k));
          keys.forEach((k) => productMap.set(k, pItem));
          const nameKey = String(pItem.name || '').trim().toLowerCase();
          if (nameKey && !productByName.has(nameKey)) productByName.set(nameKey, pItem);
        });
        const items = (computeOrderItemsByOrderId(db).get(order.localId) || []).map((it) => {
          const rawProductId = String(it.productLocalId || it.productId || '').trim();
          const productNameKey = String(it.productName || '').trim().toLowerCase();
          const product =
            (rawProductId ? productMap.get(normalizeProductKey(rawProductId)) : null) ||
            (it.productCode ? productMap.get(normalizeProductKey(it.productCode)) : null) ||
            (productNameKey ? productByName.get(productNameKey) : null) ||
            null;
          return {
            ...it,
            orderLocalId: order.localId,
            productCode: it.productCode || product?.productCode || '',
            productName: it.productName || product?.name || '',
          };
        });
        const returnIds = returns
          .filter((r) => String(r.orderLocalId || '') === String(order.localId) || String(r.orderCode || '') === String(order.orderCode || ''))
          .map((r) => r.localId);
        return { order: { ...order, _id: order.localId, returnIds }, items };
      }
      if (m === 'PATCH') {
        const next = { ...order, ...b, localId: order.localId, _id: order.localId, updatedAt: Date.now() };
        putPosDoc(db, 'pos_orders', order.localId, next);
        return { ok: true };
      }
      if (m === 'DELETE') {
        const next = { ...order, status: 'cancelled', updatedAt: Date.now() };
        putPosDoc(db, 'pos_orders', order.localId, next);
        return { ok: true };
      }
    }
    // legacy fallback from kv bundle
    if (m === 'GET') {
      const row = db.prepare(`SELECT v FROM kv_store WHERE ns = 'order_bundle' AND k = ?`).get(id);
      if (!row) return { order: null, items: [] };
      const parsed = safeJson(row.v, {});
      return { order: parsed.order || null, items: parsed.items || [] };
    }
  }

  const retMatch = p.match(/^\/api\/returns\/([^/]+)$/);
  if (retMatch) {
    const id = decodeURIComponent(retMatch[1]);
    const ret = getReturns(db).find((r) => String(r.localId) === id || String(r.returnCode) === id || String(r._id) === id);
    if (ret && m === 'GET') {
      const returnItems = computeReturnItemsByReturnId(db).get(ret.localId) || [];
      return { return: { ...ret, _id: ret.localId }, returnItems, exchangeItems: Array.isArray(ret.exchangeItems) ? ret.exchangeItems : [] };
    }
    if (ret && m === 'PATCH') {
      const next = {
        ...ret,
        ...b,
        localId: ret.localId,
        _id: ret.localId,
        status: b.status ? String(b.status) : ret.status,
        updatedAt: Date.now(),
      };
      putPosDoc(db, 'pos_returns', ret.localId, next);
      return { ok: true };
    }
    const legacyRow = db.prepare(`SELECT k, v FROM kv_store WHERE ns = 'return_bundle' AND k = ?`).get(id);
    if (!ret && legacyRow && (m === 'PATCH' || m === 'DELETE')) {
      const parsed = safeJson(legacyRow.v, {});
      const legacyReturn = parsed.return && typeof parsed.return === 'object' ? parsed.return : {};
      const nextReturn =
        m === 'DELETE'
          ? { ...legacyReturn, status: 'cancelled', updatedAt: Date.now() }
          : { ...legacyReturn, ...b, updatedAt: Date.now() };
      db.prepare(`UPDATE kv_store SET v = ? WHERE ns = 'return_bundle' AND k = ?`)
        .run(JSON.stringify({
          ...parsed,
          return: nextReturn,
          returnItems: Array.isArray(parsed.returnItems) ? parsed.returnItems : [],
          exchangeItems: Array.isArray(parsed.exchangeItems) ? parsed.exchangeItems : [],
        }), legacyRow.k);
      return { ok: true };
    }
    if (ret && m === 'DELETE') {
      const next = {
        ...ret,
        localId: ret.localId,
        _id: ret.localId,
        status: 'cancelled',
        updatedAt: Date.now(),
      };
      putPosDoc(db, 'pos_returns', ret.localId, next);
      return { ok: true };
    }
    if (m === 'GET') {
      const row = db.prepare(`SELECT v FROM kv_store WHERE ns = 'return_bundle' AND k = ?`).get(id);
      if (!row) return { return: null, returnItems: [], exchangeItems: [] };
      const parsed = safeJson(row.v, {});
      return {
        return: parsed.return || null,
        returnItems: Array.isArray(parsed.returnItems) ? parsed.returnItems : [],
        exchangeItems: Array.isArray(parsed.exchangeItems) ? parsed.exchangeItems : [],
      };
    }
  }

  // Admin reports
  if (m === 'GET' && p === '/api/reports/sales') {
    const orders = getOrders(db).filter((o) => String(o.status || '').toLowerCase() !== 'cancelled');
    const returns = getReturns(db);
    const inPeriod = buildPeriodFilter(searchParams);
    const storeId = String(searchParams.get('storeId') || '');
    const cashierId = String(searchParams.get('cashierId') || '');
    const filteredOrders = orders.filter((o) => {
      if (!inPeriod(normalizeTs(o.createdAt))) return false;
      if (storeId && String(o.storeId || '') !== storeId) return false;
      if (cashierId && String(o.cashierId || '') !== cashierId) return false;
      return true;
    });
    const filteredReturns = returns.filter((r) => {
      if (!inPeriod(normalizeTs(r.createdAt))) return false;
      if (storeId && String(r.storeId || '') !== storeId) return false;
      if (cashierId && String(r.cashierId || '') !== cashierId) return false;
      return true;
    });
    const totalSales = filteredOrders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
    const totalReturns = filteredReturns.reduce((s, r) => s + (Number(r.totalReturnAmount) || 0), 0);
    const netSales = totalSales - totalReturns;
    return {
      totalCost: 0,
      totalSales,
      totalReturns,
      netSales,
      totalProfit: netSales,
      orderCount: filteredOrders.length,
      returnCount: filteredReturns.length,
      buckets: [],
    };
  }
  if (m === 'GET' && p === '/api/reports/activity') {
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 8)));
    const rows = [
      ...getOrders(db).map((o) => ({
        type: 'order',
        localId: o.localId,
        code: o.orderCode || o.localId,
        amount: Number(o.totalAmount) || 0,
        actorName: o.cashierName || 'Nhan vien',
        createdAt: o.createdAt,
      })),
      ...getReturns(db).map((r) => ({
        type: 'return',
        localId: r.localId,
        code: r.returnCode || r.localId,
        amount: Number(r.totalReturnAmount) || 0,
        actorName: r.cashierName || 'Nhan vien',
        createdAt: r.createdAt,
      })),
    ]
      .sort((a, b) => normalizeTs(b.createdAt) - normalizeTs(a.createdAt))
      .slice(0, limit);
    return { items: rows };
  }

  if (m === 'POST' && p === '/api/auth/switch') return { message: 'ok', targetApp: b.targetApp || 'pos-app' };

  return { __noop: true, path: p, method: m };
}

module.exports = {
  verifyPassword,
  ensureKvAndStores,
  ensureDefaultStore,
  migrateLegacyProductsToKv,
  handleAuthLogin,
  handleOfflineRequest,
};
