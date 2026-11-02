import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

// Tests use SQLite's real foreign keys, triggers and transactional rollback; no SQL mocks.
export class SqliteD1 {
  constructor({migrate=true,seed=true}={}){
    this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON;');
    if(migrate){
      const directory=new URL('../../migrations/',import.meta.url);
      for(const file of readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)).sort())this.sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
    }
    if(migrate&&seed)this.seed();
    this.beforeBatch=null;this.failStatement=null;
  }
  seed(){this.sqlite.exec(readFileSync(new URL('../../server/setup/psychiatry.sql',import.meta.url),'utf8'));}
  prepare(sql){return new Statement(this,sql,[]);}
  async batch(statements){
    if(this.beforeBatch){const hook=this.beforeBatch;this.beforeBatch=null;await hook(this);}
    this.sqlite.exec('BEGIN IMMEDIATE');
    try{const results=statements.map(s=>s.execute());this.sqlite.exec('COMMIT');return results;}
    catch(error){this.sqlite.exec('ROLLBACK');throw error;}
  }
  close(){this.sqlite.close();}
}
class Statement {
  constructor(db,sql,args){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){if(args.some(v=>v===undefined))throw new TypeError('Undefined SQL binding');return new Statement(this.db,this.sql,args);}
  async first(column){const row=this.db.sqlite.prepare(this.sql).get(...this.args)??null;return column?(row?.[column]??null):row;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args)};}
  async run(){return this.execute();}
  execute(){if(this.db.failStatement?.(this.sql,this.args)){this.db.failStatement=null;throw new Error('Injected database failure');}const s=this.db.sqlite.prepare(this.sql);const result=s.run(...this.args);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
}
