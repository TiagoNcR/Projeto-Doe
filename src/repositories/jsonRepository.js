const fs = require('fs');
const path = require('path');

const databaseFile = path.join(__dirname, '..', '..', 'data.json');

function defaultDatabase() {
  return { users: [], donations: [], posts: [], sessions: [], messages: [] };
}

function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  } catch {
    return defaultDatabase();
  }
}

const database = loadDatabase();
if (!Array.isArray(database.posts)) database.posts = [];
if (!Array.isArray(database.messages)) database.messages = [];

function getDatabase() {
  return database;
}

function saveDatabase() {
  fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
}

module.exports = { getDatabase, saveDatabase };
