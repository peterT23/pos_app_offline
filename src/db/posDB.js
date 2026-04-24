/**
 * Lớp DB local: SQLite trong Electron (IPC). Không dùng Dexie/IndexedDB.
 */
import { v4 as uuidv4 } from 'uuid';

function invoke(payload) {
  if (typeof window === 'undefined' || !window.posOffline?.posDb) {
    throw new Error('POS offline cần chạy trong Electron (SQLite).');
  }
  return window.posOffline.posDb(payload);
}

function makeWhere(table, index) {
  return {
    equals(value) {
      return {
        async first() {
          return invoke({ op: 'whereFirst', table, index, value });
        },
        async toArray() {
          return invoke({ op: 'whereToArray', table, index, match: 'eq', values: [value] });
        },
        async delete() {
          return invoke({ op: 'whereDelete', table, index, match: 'eq', value });
        },
        async modify(patch) {
          return invoke({ op: 'whereModify', table, index, match: 'eq', values: [value], patch });
        },
      };
    },
    anyOf(values) {
      const arr = Array.isArray(values) ? values : [];
      return {
        async toArray() {
          return invoke({ op: 'whereToArray', table, index, match: 'anyOf', values: arr });
        },
        async modify(patch) {
          return invoke({ op: 'whereModify', table, index, match: 'anyOf', values: arr, patch });
        },
      };
    },
  };
}

function makeFilter(table, predicate) {
  return {
    async toArray() {
      const all = await invoke({ op: 'toArray', table });
      return all.filter(predicate);
    },
    async delete() {
      const all = await this.toArray();
      for (const row of all) {
        const key = row.localId;
        if (key) await invoke({ op: 'delete', table, key });
      }
    },
    async modify(patch) {
      const all = await this.toArray();
      for (const row of all) {
        if (row.localId) {
          await invoke({ op: 'update', table, key: row.localId, patch });
        }
      }
    },
  };
}

function makeTable(table) {
  return {
    get: (key) => invoke({ op: 'get', table, key }),
    put: (record) => invoke({ op: 'put', table, record }),
    add: (record) => invoke({ op: 'add', table, record }),
    update: (key, patch) => invoke({ op: 'update', table, key, patch }),
    delete: (key) => invoke({ op: 'delete', table, key }),
    clear: () => invoke({ op: 'clear', table }),
    bulkPut: (records) => invoke({ op: 'bulkPut', table, records }),
    bulkAdd: (records) => invoke({ op: 'bulkAdd', table, records }),
    toArray: () => invoke({ op: 'toArray', table }),
    count: () => invoke({ op: 'count', table }),
    where: (index) => makeWhere(table, index),
    filter: (predicate) => makeFilter(table, predicate),
  };
}

/** Giả Dexie: chỉ order_items / return_items dùng query đặc biệt */
function makeOrderItemsTable() {
  const table = 'order_items';
  return {
    toArray: () => invoke({ op: 'toArray', table }),
    bulkAdd: (records) => invoke({ op: 'bulkAdd', table, records }),
    clear: () => invoke({ op: 'clear', table }),
    where(index) {
      if (index === 'orderLocalId') {
        return {
          equals(value) {
            return {
              async toArray() {
                return invoke({ op: 'orderItemsToArray', orderLocalId: value });
              },
              async delete() {
                return invoke({ op: 'whereDelete', table, index: 'orderLocalId', match: 'eq', value });
              },
            };
          },
          anyOf(values) {
            const arr = Array.isArray(values) ? values : [];
            return {
              async toArray() {
                const out = [];
                for (const v of arr) {
                  const rows = await invoke({ op: 'orderItemsToArray', orderLocalId: v });
                  out.push(...rows);
                }
                return out;
              },
            };
          },
        };
      }
      return makeWhere(table, index);
    },
  };
}

function makeReturnItemsTable() {
  const table = 'return_items';
  return {
    toArray: () => invoke({ op: 'toArray', table }),
    bulkAdd: (records) => invoke({ op: 'bulkAdd', table, records }),
    clear: () => invoke({ op: 'clear', table }),
    where(index) {
      if (index === 'returnLocalId') {
        return {
          equals(value) {
            return {
              async toArray() {
                return invoke({ op: 'returnItemsToArray', returnLocalId: value });
              },
              async delete() {
                return invoke({ op: 'whereDelete', table, index: 'returnLocalId', match: 'eq', value });
              },
            };
          },
          anyOf(values) {
            const arr = Array.isArray(values) ? values : [];
            return {
              async toArray() {
                const out = [];
                for (const v of arr) {
                  const rows = await invoke({ op: 'returnItemsToArray', returnLocalId: v });
                  out.push(...rows);
                }
                return out;
              },
            };
          },
        };
      }
      return makeWhere(table, index);
    },
  };
}

function makeSettingsTable() {
  const table = 'settings';
  return {
    get: (key) => invoke({ op: 'get', table, key }),
    put: (record) => invoke({ op: 'put', table, record: { ...record, localId: record.key } }),
    clear: () => invoke({ op: 'clear', table }),
    bulkPut: (records) =>
      invoke({
        op: 'bulkPut',
        table,
        records: records.map((r) => ({ ...r, localId: r.key })),
      }),
    toArray: () => invoke({ op: 'toArray', table }),
    where: () => {
      throw new Error('settings.where không hỗ trợ');
    },
    filter: () => {
      throw new Error('settings.filter không hỗ trợ');
    },
  };
}

export const db = {
  name: 'pos_offline_sqlite',
  async open() {
    return undefined;
  },
  async transaction(...args) {
    const fn = args[args.length - 1];
    await invoke({ op: 'txBegin' });
    try {
      await fn();
      await invoke({ op: 'txCommit' });
    } catch (e) {
      await invoke({ op: 'txRollback' });
      throw e;
    }
  },
  products: makeTable('products'),
  customers: makeTable('customers'),
  orders: makeTable('orders'),
  order_items: makeOrderItemsTable(),
  returns: makeTable('returns'),
  return_items: makeReturnItemsTable(),
  settings: makeSettingsTable(),
  categories: makeTable('categories'),
};

export const generateLocalId = () => uuidv4();

export const generateOrderCode = async () => {
  try {
    await db.open();
    const orders = await db.orders.toArray();
    let maxNumber = -1;
    orders.forEach((order) => {
      const code = (order.orderCode || '').trim();
      const match = code.match(/^HD(\d+)$/i);
      if (match) {
        const number = Number(match[1]);
        if (!Number.isNaN(number)) {
          maxNumber = Math.max(maxNumber, number);
        }
      }
    });
    return `HD${maxNumber + 1}`;
  } catch (error) {
    console.error('Lỗi tạo mã hóa đơn:', error);
    return `HD${Date.now()}`;
  }
};

export const generateReturnCode = async () => {
  try {
    await db.open();
    const returns = await db.returns.toArray();
    let maxNumber = -1;
    returns.forEach((returnItem) => {
      const code = (returnItem.returnCode || '').trim();
      const match = code.match(/^TH(\d+)$/i);
      if (match) {
        const number = Number(match[1]);
        if (!Number.isNaN(number)) {
          maxNumber = Math.max(maxNumber, number);
        }
      }
    });
    return `TH${maxNumber + 1}`;
  } catch (error) {
    console.error('Lỗi tạo mã trả hàng:', error);
    return `TH${Date.now()}`;
  }
};

export const migrateOrderCodes = async () => {
  try {
    await db.open();
    await db.transaction('rw', db.orders, async () => {
      const orders = await db.orders.toArray();
      let maxNumber = -1;

      orders.forEach((order) => {
        const code = (order.orderCode || '').trim();
        const match = code.match(/^HD(\d+)$/i);
        if (match) {
          const number = Number(match[1]);
          if (!Number.isNaN(number)) {
            maxNumber = Math.max(maxNumber, number);
          }
        }
      });

      const needUpdate = orders
        .filter((order) => !/^HD\d+$/i.test((order.orderCode || '').trim()))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      let nextNumber = maxNumber + 1;
      for (const order of needUpdate) {
        await db.orders.update(order.localId, {
          orderCode: `HD${nextNumber}`,
        });
        nextNumber += 1;
      }
    });
  } catch (error) {
    console.error('Lỗi migrate mã hóa đơn:', error);
  }
};

export const checkBarcodeExists = async (barcode, excludeLocalId = null) => {
  if (!barcode) return false;
  try {
    await db.open();
    let query = db.products.where('barcode').equals(barcode);
    if (excludeLocalId) {
      const products = await query.toArray();
      return products.some((p) => p.localId !== excludeLocalId && !p.deleted);
    }
    const product = await query.first();
    return product && !product.deleted;
  } catch (error) {
    console.error('Lỗi kiểm tra barcode:', error);
    return false;
  }
};

export const checkPhoneExists = async (phone, excludeLocalId = null) => {
  if (!phone) return false;
  try {
    await db.open();
    let query = db.customers.where('phone').equals(phone);
    if (excludeLocalId) {
      const customers = await query.toArray();
      return customers.some((c) => c.localId !== excludeLocalId);
    }
    const customer = await query.first();
    return !!customer;
  } catch (error) {
    console.error('Lỗi kiểm tra số điện thoại:', error);
    return false;
  }
};

export const checkLocalIdExists = async (localId, tableName) => {
  if (!localId || !tableName) return false;
  try {
    await db.open();
    const table = db[tableName];
    if (!table || typeof table.get !== 'function') return false;
    const item = await table.get(localId);
    return !!item;
  } catch (error) {
    console.error('Lỗi kiểm tra localId:', error);
    return false;
  }
};

export const generateProductCode = async () => {
  try {
    await db.open();
    const allProducts = await db.products.toArray();
    const existingCodes = allProducts
      .filter((p) => p.productCode && !p.deleted)
      .map((p) => p.productCode)
      .filter((code) => /^SP\d{6}$/.test(code))
      .map((code) => {
        const match = code.match(/^SP(\d{6})$/);
        return match ? parseInt(match[1], 10) : -1;
      })
      .filter((num) => num >= 0);

    let nextNumber = 1;
    if (existingCodes.length > 0) {
      const maxNumber = Math.max(...existingCodes);
      nextNumber = maxNumber + 1;
    }
    return `SP${String(nextNumber).padStart(6, '0')}`;
  } catch (error) {
    console.error('Lỗi generate productCode:', error);
    return `SP${String(Date.now()).slice(-6)}`;
  }
};

export const checkProductCodeExists = async (productCode, excludeLocalId = null) => {
  if (!productCode) return false;
  try {
    await db.open();
    const allProducts = await db.products.toArray();
    if (excludeLocalId) {
      return allProducts.some(
        (p) => p.productCode === productCode && p.localId !== excludeLocalId && !p.deleted,
      );
    }
    return allProducts.some((p) => p.productCode === productCode && !p.deleted);
  } catch (error) {
    console.error('Lỗi kiểm tra productCode:', error);
    return false;
  }
};

export const generateCustomerCode = async () => {
  try {
    await db.open();
    const allCustomers = await db.customers.toArray();
    const existingCodes = allCustomers
      .filter((c) => c.customerCode)
      .map((c) => c.customerCode)
      .filter((code) => /^KH\d{6}$/.test(code))
      .map((code) => {
        const match = code.match(/^KH(\d{6})$/);
        return match ? parseInt(match[1], 10) : -1;
      })
      .filter((num) => num >= 0);

    let nextNumber = 1;
    if (existingCodes.length > 0) {
      const maxNumber = Math.max(...existingCodes);
      nextNumber = maxNumber + 1;
    }
    return `KH${String(nextNumber).padStart(6, '0')}`;
  } catch (error) {
    console.error('Lỗi generate customerCode:', error);
    return `KH${String(Date.now()).slice(-6)}`;
  }
};

export const checkCustomerCodeExists = async (customerCode, excludeLocalId = null) => {
  if (!customerCode) return false;
  try {
    await db.open();
    const allCustomers = await db.customers.toArray();
    if (excludeLocalId) {
      return allCustomers.some(
        (c) => c.customerCode === customerCode && c.localId !== excludeLocalId,
      );
    }
    return allCustomers.some((c) => c.customerCode === customerCode);
  } catch (error) {
    console.error('Lỗi kiểm tra customerCode:', error);
    return false;
  }
};

export default db;
