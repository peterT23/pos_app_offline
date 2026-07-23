/**
 * Lưu toàn bộ dữ liệu POS (thay Dexie) trong SQLite — chạy trên main process.
 */

const TX = { depth: 0 };

function txBegin(db) {
  if (TX.depth === 0) {
    db.exec('BEGIN IMMEDIATE');
  } else {
    db.exec(`SAVEPOINT sp_${TX.depth}`);
  }
  TX.depth += 1;
}

function txCommit(db) {
  if (TX.depth <= 0) return;
  TX.depth -= 1;
  if (TX.depth === 0) {
    db.exec('COMMIT');
  } else {
    db.exec(`RELEASE SAVEPOINT sp_${TX.depth}`);
  }
}

function txRollback(db) {
  if (TX.depth <= 0) return;
  TX.depth -= 1;
  if (TX.depth === 0) {
    db.exec('ROLLBACK');
  } else {
    db.exec(`ROLLBACK TO SAVEPOINT sp_${TX.depth}`);
  }
}

const T = {
  products: 'pos_products',
  customers: 'pos_customers',
  orders: 'pos_orders',
  order_items: 'pos_order_items',
  returns: 'pos_returns',
  return_items: 'pos_return_items',
  settings: 'pos_settings',
  categories: 'pos_categories',
};

function initPosTables(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;

    CREATE TABLE IF NOT EXISTS pos_products (local_id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_pos_products_barcode ON pos_products ((json_extract(doc, '$.barcode')));

    CREATE TABLE IF NOT EXISTS pos_customers (local_id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_pos_customers_phone ON pos_customers ((json_extract(doc, '$.phone')));

    CREATE TABLE IF NOT EXISTS pos_orders (local_id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_pos_orders_customer ON pos_orders ((json_extract(doc, '$.customerLocalId')));
    CREATE INDEX IF NOT EXISTS idx_pos_orders_code ON pos_orders ((json_extract(doc, '$.orderCode')));

    CREATE TABLE IF NOT EXISTS pos_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_local_id TEXT NOT NULL,
      doc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pos_oi_order ON pos_order_items(order_local_id);

    CREATE TABLE IF NOT EXISTS pos_returns (local_id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_local_id TEXT NOT NULL,
      doc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pos_ri_return ON pos_return_items(return_local_id);

    CREATE TABLE IF NOT EXISTS pos_settings (local_id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_categories (local_id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL);
  `);
}

function migrateKvProductsToPos(db) {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM pos_products`).get();
  if (c > 0) return;
  const rows = db.prepare(`SELECT k, v FROM kv_store WHERE ns = 'product'`).all();
  const ins = db.prepare(`INSERT OR IGNORE INTO pos_products (local_id, doc) VALUES (?, ?)`);
  for (const r of rows) {
    try {
      const o = JSON.parse(r.v);
      const lid = o.localId || r.k;
      if (!lid) continue;
      ins.run(String(lid), JSON.stringify(o));
    } catch {
      // skip
    }
  }
  const legacy = db.prepare('SELECT id, name, barcode, sku, stock, unit, price, created_at FROM products').all();
  for (const row of legacy) {
    const localId = `p-${row.id}`;
    const doc = {
      localId,
      productCode: row.sku || `SP${String(row.id).padStart(6, '0')}`,
      name: row.name,
      barcode: row.barcode || '',
      price: Number(row.price) || 0,
      stock: Number(row.stock) || 0,
      unit: row.unit || 'cái',
      synced: true,
      deleted: false,
      allowPoints: true,
      createdAt: row.created_at,
    };
    ins.run(localId, JSON.stringify(doc));
  }
}

function parseDoc(row) {
  return JSON.parse(row.doc);
}

function tableSql(name) {
  const sql = T[name];
  if (!sql) throw new Error(`Unknown table ${name}`);
  return sql;
}

function getByPk(db, table, key) {
  const row = db.prepare(`SELECT doc FROM ${tableSql(table)} WHERE local_id = ?`).get(key);
  return row ? parseDoc(row) : undefined;
}

function putDoc(db, table, record) {
  const sql = tableSql(table);
  const key = record.localId != null ? record.localId : record.key;
  if (key == null || key === '') throw new Error('put: missing localId/key');
  db.prepare(`INSERT OR REPLACE INTO ${sql} (local_id, doc) VALUES (?, ?)`).run(String(key), JSON.stringify(record));
  return key;
}

function mergePatch(prev, patch) {
  return { ...prev, ...patch };
}

function handlePosDb(db, payload) {
  const { op } = payload;
  if (!op) throw new Error('posDb: missing op');

  if (op === 'txBegin') {
    txBegin(db);
    return true;
  }
  if (op === 'txCommit') {
    txCommit(db);
    return true;
  }
  if (op === 'txRollback') {
    txRollback(db);
    return true;
  }

  if (op === 'clearAllData') {
    txBegin(db);
    try {
      for (const k of Object.keys(T)) {
        db.exec(`DELETE FROM ${T[k]}`);
      }
      try {
        db.exec('DELETE FROM kv_store');
      } catch {
        // bảng có thể không tồn tại
      }
      txCommit(db);
    } catch (e) {
      txRollback(db);
      throw e;
    }
    return true;
  }

  if (op === 'get') {
    return getByPk(db, payload.table, payload.key);
  }

  if (op === 'put') {
    return putDoc(db, payload.table, payload.record);
  }

  if (op === 'add') {
    const cur = getByPk(db, payload.table, payload.record.localId);
    if (cur !== undefined) throw new Error('Key already exists');
    return putDoc(db, payload.table, payload.record);
  }

  if (op === 'bulkPut') {
    const sql = tableSql(payload.table);
    const ins = db.prepare(`INSERT OR REPLACE INTO ${sql} (local_id, doc) VALUES (?, ?)`);
    txBegin(db);
    try {
      for (const rec of payload.records || []) {
        if (rec && rec.localId) ins.run(rec.localId, JSON.stringify(rec));
      }
      txCommit(db);
    } catch (e) {
      txRollback(db);
      throw e;
    }
    return true;
  }

  if (op === 'bulkAdd') {
    const table = payload.table;
    if (table === 'order_items' || table === 'return_items') {
      const sql = T[table];
      const col = table === 'order_items' ? 'order_local_id' : 'return_local_id';
      const fk = table === 'order_items' ? 'orderLocalId' : 'returnLocalId';
      const ins = db.prepare(`INSERT INTO ${sql} (${col}, doc) VALUES (?, ?)`);
      const upd = db.prepare(`UPDATE ${sql} SET doc = ? WHERE id = ?`);
      txBegin(db);
      try {
        for (const rec of payload.records || []) {
          const fkVal = rec[fk];
          let doc = { ...rec };
          const r = ins.run(fkVal, JSON.stringify({ ...doc, id: null }));
          const id = Number(r.lastInsertRowid);
          doc = { ...doc, id };
          upd.run(JSON.stringify(doc), id);
        }
        txCommit(db);
      } catch (e) {
        txRollback(db);
        throw e;
      }
      return true;
    }
    const ins = db.prepare(`INSERT INTO ${tableSql(table)} (local_id, doc) VALUES (?, ?)`);
    txBegin(db);
    try {
      for (const rec of payload.records || []) {
        if (rec && rec.localId) ins.run(rec.localId, JSON.stringify(rec));
      }
      txCommit(db);
    } catch (e) {
      txRollback(db);
      throw e;
    }
    return true;
  }

  if (op === 'update') {
    const cur = getByPk(db, payload.table, payload.key);
    if (cur === undefined) return false;
    const next = mergePatch(cur, payload.patch || {});
    putDoc(db, payload.table, next);
    return true;
  }

  if (op === 'delete') {
    db.prepare(`DELETE FROM ${tableSql(payload.table)} WHERE local_id = ?`).run(payload.key);
    return true;
  }

  if (op === 'clear') {
    db.exec(`DELETE FROM ${tableSql(payload.table)}`);
    return true;
  }

  if (op === 'toArray') {
    const tbl = payload.table;
    if (tbl === 'order_items') {
      const rows = db.prepare('SELECT doc FROM pos_order_items ORDER BY id').all();
      return rows.map((r) => parseDoc(r));
    }
    if (tbl === 'return_items') {
      const rows = db.prepare('SELECT doc FROM pos_return_items ORDER BY id').all();
      return rows.map((r) => parseDoc(r));
    }
    const rows = db.prepare(`SELECT doc FROM ${tableSql(tbl)}`).all();
    return rows.map((r) => parseDoc(r));
  }

  if (op === 'count') {
    if (payload.table === 'order_items') {
      const r = db.prepare('SELECT COUNT(*) AS c FROM pos_order_items').get();
      return r.c;
    }
    if (payload.table === 'return_items') {
      const r = db.prepare('SELECT COUNT(*) AS c FROM pos_return_items').get();
      return r.c;
    }
    const r = db.prepare(`SELECT COUNT(*) AS c FROM ${tableSql(payload.table)}`).get();
    return r.c;
  }

  if (op === 'whereFirst') {
    const { table, index, value } = payload;
    const rows = db.prepare(`SELECT doc FROM ${tableSql(table)}`).all();
    for (const r of rows) {
      const o = parseDoc(r);
      if (o[index] === value) return o;
    }
    return undefined;
  }

  if (op === 'whereToArray') {
    const { table, index, match, values } = payload;
    const rows = db.prepare(`SELECT doc FROM ${tableSql(table)}`).all();
    const out = [];
    for (const r of rows) {
      const o = parseDoc(r);
      if (match === 'eq' && o[index] === values[0]) out.push(o);
      if (match === 'anyOf' && values.includes(o[index])) out.push(o);
    }
    return out;
  }

  if (op === 'whereDelete') {
    const { table, index, match, value } = payload;
    if (table === 'order_items' || table === 'return_items') {
      const sql = T[table];
      const col = table === 'order_items' ? 'order_local_id' : 'return_local_id';
      db.prepare(`DELETE FROM ${sql} WHERE ${col} = ?`).run(value);
      return true;
    }
    const keys = db
      .prepare(`SELECT local_id FROM ${tableSql(table)}`)
      .all()
      .map((x) => x.local_id)
      .filter((id) => {
        const o = getByPk(db, table, id);
        return o && o[index] === value;
      });
    for (const k of keys) {
      db.prepare(`DELETE FROM ${tableSql(table)} WHERE local_id = ?`).run(k);
    }
    return true;
  }

  if (op === 'whereModify') {
    const { table, index, match, values, patch } = payload;
    const rows = db.prepare(`SELECT local_id, doc FROM ${tableSql(table)}`).all();
    const ins = db.prepare(`INSERT OR REPLACE INTO ${tableSql(table)} (local_id, doc) VALUES (?, ?)`);
    txBegin(db);
    try {
      for (const r of rows) {
        const o = parseDoc(r);
        let hit = false;
        if (match === 'eq' && o[index] === values[0]) hit = true;
        if (match === 'anyOf' && values.includes(o[index])) hit = true;
        if (hit) {
          ins.run(r.local_id, JSON.stringify(mergePatch(o, patch)));
        }
      }
      txCommit(db);
    } catch (e) {
      txRollback(db);
      throw e;
    }
    return true;
  }

  if (op === 'orderItemsToArray') {
    const rows = db
      .prepare('SELECT doc FROM pos_order_items WHERE order_local_id = ? ORDER BY id')
      .all(payload.orderLocalId);
    return rows.map((r) => parseDoc(r));
  }

  if (op === 'returnItemsToArray') {
    const rows = db
      .prepare('SELECT doc FROM pos_return_items WHERE return_local_id = ? ORDER BY id')
      .all(payload.returnLocalId);
    return rows.map((r) => parseDoc(r));
  }

  if (op === 'bootstrapReplace') {
    const { products = [], customers = [], settings = [] } = payload;
    txBegin(db);
    try {
      db.exec('DELETE FROM pos_products');
      db.exec('DELETE FROM pos_customers');
      db.exec('DELETE FROM pos_settings');
      const ip = db.prepare('INSERT INTO pos_products (local_id, doc) VALUES (?, ?)');
      const ic = db.prepare('INSERT INTO pos_customers (local_id, doc) VALUES (?, ?)');
      const is = db.prepare('INSERT INTO pos_settings (local_id, doc) VALUES (?, ?)');
      for (const pr of products) {
        const k = pr.localId || pr.id;
        if (k) ip.run(String(k), JSON.stringify(pr));
      }
      for (const c of customers) {
        const k = c.localId || c.id;
        if (k) ic.run(String(k), JSON.stringify(c));
      }
      for (const s of settings) {
        if (s && s.key != null) is.run(String(s.key), JSON.stringify({ key: s.key, value: s.value }));
      }
      txCommit(db);
    } catch (e) {
      txRollback(db);
      throw e;
    }
    return true;
  }

  if (op === 'exportBootstrap') {
    const products = db.prepare('SELECT doc FROM pos_products').all().map((r) => parseDoc(r));
    const customers = db.prepare('SELECT doc FROM pos_customers').all().map((r) => parseDoc(r));
    const settingsRows = db.prepare('SELECT doc FROM pos_settings').all();
    const settings = settingsRows.map((r) => {
      const o = parseDoc(r);
      return { key: o.key, value: o.value };
    });
    return { products, customers, settings };
  }

  if (op === 'mergeMaster') {
    const products = payload.products || [];
    const customers = payload.customers || [];
    txBegin(db);
    try {
      const ip = db.prepare(`INSERT OR REPLACE INTO pos_products (local_id, doc) VALUES (?, ?)`);
      const ic = db.prepare(`INSERT OR REPLACE INTO pos_customers (local_id, doc) VALUES (?, ?)`);
      for (const pr of products) {
        const k = pr.localId || pr.id;
        if (k) ip.run(String(k), JSON.stringify(pr));
      }
      for (const c of customers) {
        const k = c.localId || c.id;
        if (k) ic.run(String(k), JSON.stringify(c));
      }
      txCommit(db);
    } catch (e) {
      txRollback(db);
      throw e;
    }
    return true;
  }

  throw new Error(`posDb: unknown op ${op}`);
}

module.exports = {
  initPosTables,
  migrateKvProductsToPos,
  handlePosDb,
};
