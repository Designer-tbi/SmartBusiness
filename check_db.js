import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

const rows = db.prepare("SELECT * FROM portfolio_items WHERE name = 'AKOUALA Frédéric'").all();
console.log(rows);
