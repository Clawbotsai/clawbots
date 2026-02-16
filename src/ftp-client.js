const ftp = require('basic-ftp');
const SFTP = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pLimit = require('p-limit');
const pRetry = require('p-retry');

class FTPClient {
  constructor(opts = {}) {
    this.cfgDir = path.join(os.homedir(), '.clawbots');
    this.cfgPath = path.join(this.cfgDir, 'connections.json');
    this.connections = this.load();
    this.concurrency = opts.concurrency || 5;
    this.retries = opts.retries || 3;
  }

  load() {
    try {
      if (fs.existsSync(this.cfgPath)) {
        const d = JSON.parse(fs.readFileSync(this.cfgPath));
        Object.keys(d).forEach(k => {
          if (d[k].password?.startsWith('base64:')) {
            d[k].password = Buffer.from(d[k].password.slice(7), 'base64').toString();
          }
        });
        return d;
      }
    } catch (e) {}
    return {};
  }

  save() {
    if (!fs.existsSync(this.cfgDir)) fs.mkdirSync(this.cfgDir, { recursive: true });
    const e = JSON.parse(JSON.stringify(this.connections));
    Object.keys(e).forEach(k => {
      if (e[k].password) {
        e[k].password = 'base64:' + Buffer.from(e[k].password).toString('base64');
      }
    });
    fs.writeFileSync(this.cfgPath, JSON.stringify(e, null, 2));
    fs.chmodSync(this.cfgPath, 0o600);
  }

  add(name, cfg) {
    if (!name || !cfg.host || !cfg.username) throw new Error('Required: name, host, username');
    this.connections[name] = {
      host: cfg.host,
      port: cfg.port || (cfg.protocol === 'sftp' ? 22 : 21),
      username: cfg.username,
      password: cfg.password,
      protocol: cfg.protocol || 'ftp'
    };
    this.save();
    return { success: true, message: `Added: ${name}` };
  }

  remove(name) {
    if (!this.connections[name]) throw new Error(`Not found: ${name}`);
    delete this.connections[name];
    this.save();
    return { success: true, message: `Removed: ${name}` };
  }

  list() {
    return Object.keys(this.connections).map(n => ({
      name: n,
      host: this.connections[n].host,
      protocol: this.connections[n].protocol
    }));
  }

  async test(name) {
    const s = Date.now();
    try {
      const { client, type } = await this.connect(name);
      await this.close(client, type);
      return { success: true, latency: Date.now() - s };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async connect(name) {
    const c = this.connections[name];
    if (!c) throw new Error(`Not found: ${name}`);
    const to = new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 30000));
    return Promise.race([
      c.protocol === 'sftp' ? this.conSFTP(c) : this.conFTP(c),
      to
    ]);
  }

  async conFTP(c) {
    const cl = new ftp.Client();
    await cl.access({
      host: c.host,
      port: c.port || 21,
      user: c.username,
      password: c.password,
      secure: c.protocol === 'ftps'
    });
    return { client: cl, type: 'ftp' };
  }

  async conSFTP(c) {
    const cl = new SFTP();
    const o = {
      host: c.host,
      port: c.port || 22,
      username: c.username,
      readyTimeout: 30000
    };
    if (c.privateKey) {
      o.privateKey = fs.readFileSync(c.privateKey.replace(/^~/, os.homedir()));
    } else {
      o.password = c.password;
    }
    await cl.connect(o);
    return { client: cl, type: 'sftp' };
  }

  async upload(conn, local, remote, opts = {}) {
    const { recursive = false, dryRun = false } = opts;
    if (!fs.existsSync(local)) throw new Error(`Not found: ${local}`);
    
    if (dryRun) {
      const files = recursive && fs.statSync(local).isDirectory() ? this.getFiles(local) : [local];
      return { dryRun: true, files: files.length };
    }

    if (recursive && fs.statSync(local).isDirectory()) {
      return this.upDir(conn, local, remote);
    }
return this.upFile(conn, local, remote);
  }

  async upFile(conn, local, remote) {
    const { client, type } = await this.connect(conn);
    try {
      const d = path.posix.dirname(remote);
      if (type === 'ftp') await client.ensureDir(d);
      else await client.mkdir(d, true);
      if (type === 'ftp') await client.uploadFrom(local, remote);
      else await client.put(local, remote);
      return { success: true, message: `Uploaded: ${path.basename(local)}` };
    } finally {
      await this.close(client, type);
    }
  }

  async upDir(conn, localDir, remoteDir) {
    const files = this.getFiles(localDir);
    const limit = pLimit(this.concurrency);
    let up = 0;
    let fl = 0;
    
    await Promise.all(files.map(f => limit(async () => {
      const rel = path.relative(localDir, f).replace(/\\/g, '/');
      const rem = path.posix.join(remoteDir, rel);
      try {
        await pRetry(() => this.upSingle(conn, f, rem), { retries: this.retries });
        up++;
        process.stdout.write(`\r✓ ${up}/${files.length}`);
      } catch (e) {
        fl++;
        console.error(`\n✗ ${rel}: ${e.message}`);
      }
    })));
    
    console.log();
    return { success: true, uploaded: up, failed: fl };
  }

  async upSingle(conn, local, remote) {
    const { client, type } = await this.connect(conn);
    try {
      const d = path.posix.dirname(remote);
      if (type === 'ftp') await client.ensureDir(d);
      else await client.mkdir(d, true);
      if (type === 'ftp') await client.uploadFrom(local, remote);
      else await client.put(local, remote);
    } finally {
      await this.close(client, type);
    }
  }

  async download(conn, rem, loc, opts = {}) {
    const { recursive = false } = opts;
    if (recursive) return this.dlDir(conn, rem, loc);
    
    const { client, type } = await this.connect(conn);
    try {
      const d = path.dirname(loc);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      if (type === 'ftp') await client.downloadTo(loc, rem);
      else await client.get(rem, loc);
      return { success: true, message: `Downloaded: ${path.basename(loc)}` };
    } finally {
      await this.close(client, type);
    }
  }

  async dlDir(conn, remDir, locDir) {
    const { client, type } = await this.connect(conn);
    let dl = 0;
    
    const dlRec = async (rD, lD) => {
      if (!fs.existsSync(lD)) fs.mkdirSync(lD, { recursive: true });
      const items = await client.list(rD);
      for (const item of items) {
        const rP = path.posix.join(rD, item.name);
        const lP = path.join(lD, item.name);
        if (item.type === 'd') {
          await dlRec(rP, lP);
        } else {
          try {
            if (type === 'ftp') await client.downloadTo(lP, rP);
            else await client.get(rP, lP);
            dl++;
            process.stdout.write(`\r✓ ${dl}`);
          } catch (e) {
            console.error(`\n✗ ${item.name}: ${e.message}`);
          }
        }
      }
    };
    
    try {
      await dlRec(remDir, locDir);
    } finally {
      await this.close(client, type);
    }
    console.log();
    return { success: true, downloaded: dl };
  }

  async sync(conn, localDir, remoteDir, opts = {}) {
    const { dryRun = false } = opts;
    let ig = require('ignore')().add(['.git/', 'node_modules/', '.env', '.DS_Store']);
    if (fs.existsSync('.clawbotsignore')) {
      ig = ig.add(fs.readFileSync('.clawbotsignore', 'utf8'));
    } else if (fs.existsSync('.gitignore')) {
      ig = ig.add(fs.readFileSync('.gitignore', 'utf8'));
    }
    
    const files = this.getFiles(localDir).filter(f => !ig.ignores(path.relative(localDir, f)));
    if (dryRun) return { dryRun: true, upload: files.length };
    
    let up = 0;
    for (const f of files) {
      const rel = path.relative(localDir, f).replace(/\\/g, '/');
      const rem = path.posix.join(remoteDir, rel);
      try {
        await this.upSingle(conn, f, rem);
        up++;
      } catch (e) {
console.error(`✗ ${rel}: ${e.message}`);
      }
    }
    return { success: true, uploaded: up };
  }

  getFiles(d) {
    const f = [];
    const walk = dir => {
      fs.readdirSync(dir).forEach(x => {
        const p = path.join(dir, x);
        if (fs.statSync(p).isDirectory()) walk(p);
        else f.push(p);
      });
    };
    walk(d);
    return f;
  }

  async close(c, t) {
    try {
      if (t === 'ftp') c.close();
      else await c.end();
    } catch (e) {}
  }
}

module.exports = FTPClient;
