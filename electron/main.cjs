const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const Database = require('better-sqlite3');
const offlineApi = require('./offlineApi.cjs');
const posSqlite = require('./posSqliteService.cjs');

let mainWindow;
let db;
let dbPath;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function tableColumnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function ensureColumn(table, name, sqlTypeDefault) {
  const cols = tableColumnNames(table);
  if (!cols.includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sqlTypeDefault}`);
  }
}

function initDatabase() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'pos_offline.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      phone TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  ensureColumn('products', 'barcode', 'TEXT');
  ensureColumn('products', 'sku', 'TEXT');
  ensureColumn('products', 'stock', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'unit', "TEXT NOT NULL DEFAULT 'cái'");

  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (!row) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', '2');
  } else {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', '2');
  }

  offlineApi.ensureKvAndStores(db);
  offlineApi.ensureDefaultStore(db);
  posSqlite.initPosTables(db);
  posSqlite.migrateKvProductsToPos(db);
}

function seedDemoData() {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, name, role, phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  insertUser.run(
    'owner@demo.local',
    hashPassword('Demo@123456'),
    'Chủ cửa hàng demo',
    'owner',
    '0909123456',
    now,
  );

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
  if (count > 0) return;

  const ins = db.prepare(`
    INSERT INTO products (name, barcode, sku, stock, unit, price, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const samples = [
    ['Coca Cola 330ml', '8934563138165', 'SP000001', 240, 'lon', 10000],
    ['Pepsi 330ml', '8935049500362', 'SP000002', 180, 'lon', 9500],
    ['Mì Hảo Hảo tôm chua cay', '8934563133120', 'SP000003', 500, 'gói', 3500],
    ['Nước suối Lavie 500ml', '8935049500263', 'SP000004', 300, 'chai', 5000],
    ['Sữa TH true milk 180ml', '8935236400012', 'SP000005', 96, 'hộp', 6000],
    ['Bánh Oreo 137g', '7622210283949', 'SP000006', 72, 'gói', 28000],
  ];
  for (const [name, barcode, sku, stock, unit, price] of samples) {
    ins.run(name, barcode, sku, stock, unit, price, now);
  }
}

function seedPosSamples() {
  const nowIso = new Date().toISOString();
  const hasPosProducts = Number(posSqlite.handlePosDb(db, { op: 'count', table: 'products' }) || 0) > 0;
  if (!hasPosProducts) {
    const sampleProducts = [
      {
        localId: 'p-demo-000001',
        productCode: 'SP000001',
        name: 'Coca Cola 330ml',
        barcode: '8934563138165',
        unit: 'lon',
        price: 10000,
        stock: 240,
        synced: true,
        deleted: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        localId: 'p-demo-000002',
        productCode: 'SP000002',
        name: 'Pepsi 330ml',
        barcode: '8935049500362',
        unit: 'lon',
        price: 9500,
        stock: 180,
        synced: true,
        deleted: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        localId: 'p-demo-000003',
        productCode: 'SP000003',
        name: 'Mì Hảo Hảo tôm chua cay',
        barcode: '8934563133120',
        unit: 'gói',
        price: 3500,
        stock: 500,
        synced: true,
        deleted: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];
    posSqlite.handlePosDb(db, { op: 'bulkPut', table: 'products', records: sampleProducts });
  }

  // Không seed "Khách lẻ" vào danh sách khách hàng.
  // Dọn luôn bản ghi demo cũ để dữ liệu hiện tại nhất quán.
  try {
    const customers = posSqlite.handlePosDb(db, { op: 'toArray', table: 'customers' }) || [];
    for (const c of customers) {
      const localId = String(c.localId || '').trim();
      const customerCode = String(c.customerCode || '').trim().toUpperCase();
      const fullName = String(c.fullName || c.name || '').trim().toLowerCase();
      if (localId === 'c-demo-000001' || (customerCode === 'KH000001' && fullName === 'khách lẻ')) {
        posSqlite.handlePosDb(db, { op: 'delete', table: 'customers', key: localId });
      }
    }
  } catch {
    // ignore cleanup error
  }

  const hasSettings = Number(posSqlite.handlePosDb(db, { op: 'count', table: 'settings' }) || 0) > 0;
  if (!hasSettings) {
    posSqlite.handlePosDb(db, {
      op: 'bulkPut',
      table: 'settings',
      records: [
        { localId: 'store_name', key: 'store_name', value: 'Cửa hàng offline demo' },
        { localId: 'store_phone', key: 'store_phone', value: '0909123456' },
      ],
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    backgroundThrottling: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  const devUrl = 'http://localhost:5188/#/';
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL(devUrl);
    if (!process.env.POS_OFFLINE_NO_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'), { hash: '/' });
  }
}

ipcMain.handle('db:ping', () => {
  if (!db) return { ok: false, error: 'db not init' };
  try {
    const row = db.prepare('SELECT 1 AS ok').get();
    return { ok: true, sqlite: row?.ok === 1 };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('db:getPath', () => {
  if (!dbPath) return { path: null, userData: null };
  return { path: dbPath, userData: path.dirname(dbPath) };
});

ipcMain.handle('db:revealFile', () => {
  if (!dbPath) return { ok: false, error: 'no path' };
  shell.showItemInFolder(dbPath);
  return { ok: true };
});

ipcMain.handle('db:openInDbBrowser', async () => {
  if (!dbPath) return { ok: false, error: 'no path' };

  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile('open', ['-a', 'DB Browser for SQLite', dbPath], (err) => {
        if (err) {
          resolve({
            ok: false,
            error: 'Chưa tìm thấy DB Browser for SQLite. Hãy cài app hoặc đặt làm mặc định cho file .db',
          });
          return;
        }
        resolve({ ok: true });
      });
    });
  }

  // Fallback: mở bằng app mặc định của hệ điều hành.
  const errText = await shell.openPath(dbPath);
  if (errText) return { ok: false, error: errText };
  return { ok: true };
});

ipcMain.handle('db:listUsers', () => {
  if (!db) return [];
  return db.prepare('SELECT id, email, name, role, phone, created_at FROM users ORDER BY id').all();
});

ipcMain.handle('db:listProducts', () => {
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT doc FROM pos_products ORDER BY local_id').all();
    if (rows.length > 0) {
      return rows.map((r) => {
        const d = JSON.parse(r.doc);
        return {
          id: d.localId,
          name: d.name,
          barcode: d.barcode,
          sku: d.productCode,
          stock: d.stock,
          unit: d.unit,
          price: d.price,
          created_at: d.createdAt,
        };
      });
    }
  } catch {
    // pos_products có thể chưa tồn tại ở DB cũ
  }
  return db
    .prepare(
      `SELECT id, name, barcode, sku, stock, unit, price, created_at
       FROM products ORDER BY id`,
    )
    .all();
});

ipcMain.handle('posDb', (_e, payload) => {
  if (!db) throw new Error('Database not initialized');
  return posSqlite.handlePosDb(db, payload);
});

ipcMain.handle('auth:login', (_e, { identifier, password }) => {
  if (!db) return { ok: false, message: 'Chưa khởi tạo database' };
  return offlineApi.handleAuthLogin(db, identifier, password);
});

ipcMain.handle('offline:api', (_e, payload) => {
  if (!db) return { __error: true, message: 'Database unavailable', status: 503 };
  try {
    return offlineApi.handleOfflineRequest(db, payload);
  } catch (err) {
    return { __error: true, message: String(err.message || err), status: 500 };
  }
});

app.whenReady().then(() => {
  try {
    initDatabase();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('SQLite init failed:', e);
    db = null;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
