const path = require('path');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  module.exports = require('./db-pg');
} else {
  module.exports = require('./db-sqlite');
}
