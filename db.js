'use strict';
const fs = require('fs');
const path = require('path');

/*
  A very small database: everything lives in one JSON file with three lists
  (users, items, messages). Every save writes a temporary file first and then
  renames it, so a crash can never leave a half-written file behind.
  Good for a college or demo project. For a big site, move to SQLite or MongoDB.
*/
class Db {
  constructor(file) {
    this.file = file;
    this.data = { users: [], items: [], messages: [] };
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.keys(this.data).forEach((k) => { if (Array.isArray(saved[k])) this.data[k] = saved[k]; });
    } catch (e) { /* first run: start empty */ }
  }

  col(name) { return this.data[name]; }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Db };
