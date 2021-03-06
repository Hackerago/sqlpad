const path = require('path');
const datastore = require('nedb-promise');
const mkdirp = require('mkdirp');
const appLog = require('./app-log');
const Models = require('../models');
const SequelizeDb = require('../sequelize-db');

/**
 * Whenever possible nedb should be read from the app req object.
 * Sometimes this isn't possible or convenient at the moment however.
 * For those cases, this module provides access by caching the nedb instance.
 * Safety measures have been added to ensure only 1 instance of nedb can be initialized per alias
 */
let instances = {};

/**
 * Get nedb instance for an optional alias.
 * Returns promise of nedb instance
 * @param {string} [instanceAlias]
 */
async function getDb(instanceAlias = 'default') {
  const instancePromise = instances[instanceAlias];
  if (!instancePromise) {
    throw new Error('db instance must be created first');
  }
  // nedb will already be a promise -- this just makes it explicit
  const { nedb, models, sequelizeDb } = await instancePromise;
  return { nedb, models, sequelizeDb };
}

/**
 * Initialize nedb for a given config
 * @param {object} config
 */
async function initNedb(config) {
  const dbPath = config.get('dbPath');
  const dbInMemory = config.get('dbInMemory');

  mkdirp.sync(path.join(dbPath, '/cache'));

  function getDatastore(dbName) {
    return dbInMemory
      ? datastore()
      : datastore({ filename: path.join(dbPath, dbName) });
  }

  const nedb = {
    users: getDatastore('users.db'),
    connections: getDatastore('connections.db'),
    connectionAccesses: getDatastore('connectionaccesses.db'),
    queries: getDatastore('queries.db'),
    queryHistory: getDatastore('queryhistory.db'),
    cache: getDatastore('cache.db'),
    instances: [
      'users',
      'connections',
      'connectionAccesses',
      'queries',
      'queryHistory',
      'cache',
    ],
  };

  // Load dbs, migrate data, and apply indexes
  await Promise.all(
    nedb.instances.map((dbname) => {
      appLog.info('Loading %s', dbname);
      return nedb[dbname].loadDatabase();
    })
  );

  const sequelizeDb = new SequelizeDb(config);
  const models = new Models(sequelizeDb, config);

  return { nedb, models, sequelizeDb };
}

/**
 * Initializes an nedb instance for a given config.
 * Ensures that this only happens once for a given alias.
 * If this were called multiple times weird things could happen
 * @param {object} config
 * @param {string} instanceAlias
 */
function makeDb(config, instanceAlias = 'default') {
  // makeDb should only be called once for a given alias
  if (instances[instanceAlias]) {
    throw new Error(`db instance ${instanceAlias} already made`);
  }
  const dbPromise = initNedb(config);
  instances[instanceAlias] = dbPromise;
  return true;
}

module.exports = {
  makeDb,
  getDb,
};
