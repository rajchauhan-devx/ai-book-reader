/* global jest */

const values = new Map();

const storage = {
  getItem: jest.fn(async key => values.get(key) ?? null),
  setItem: jest.fn(async (key, value) => {
    values.set(key, value);
  }),
  removeItem: jest.fn(async key => {
    values.delete(key);
  }),
  clear: jest.fn(async () => {
    values.clear();
  }),
  getAllKeys: jest.fn(async () => Array.from(values.keys())),
};

module.exports = {__esModule: true, default: storage};
