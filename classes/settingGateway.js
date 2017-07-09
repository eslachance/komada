const SettingResolver = require("./settingResolver");
const CacheManager = require("./cacheManager");
const SchemaManager = require("./schemaManager");
const SQL = require("./sql");

/* eslint-disable no-restricted-syntax */
module.exports = class SettingGateway extends CacheManager {
  constructor(client, type) {
    super(client);

    /** @type {Client} */
    this.client = client;

    /** @type {string} */
    this.type = type;

    /** @type {string} */
    this.engine = client.config.provider.engine || "json";

    this.resolver = new SettingResolver(client);
    this.schemaManager = new SchemaManager(this.client);
  }

  /**
   * Initialize the configuration for all Guilds.
   * @returns {void}
   */
  async init() {
    this.provider = this.client.providers.get(this.engine);
    if (!this.provider) throw `This provider (${this.engine}) does not exist in your system.`;
    await this.schemaManager.init();
    this.sql = this.provider.conf.sql ? new SQL(this.client, this.provider) : false;
    if (!(await this.provider.hasTable(this.type))) {
      const SQLCreate = this.sql ? this.sql.buildSQLSchema(this.schema) : undefined;
      await this.provider.createTable(this.type, SQLCreate);
    }
    const data = await this.provider.getAll(this.type);
    if (this.sql) {
      this.sql.initDeserialize();
      for (let i = 0; i < data.length; i++) this.sql.deserializer(data[i]);
    }
    if (data[0]) for (const key of data) super.set(key.id, key);
  }

  /**
   * Get the current DataSchema.
   * @readonly
   * @returns {Object}
   */
  get schema() {
    return this.schemaManager.schema;
  }

  /**
   * Get the default values from the current DataSchema.
   * @readonly
   * @returns {Object}
   */
  get defaults() {
    return this.schemaManager.defaults;
  }

  /**
   * Create a new Guild entry for the configuration.
   * @param {Guild|Snowflake} guild The Guild object or snowflake.
   * @returns {void}
   */
  async create(guild) {
    const target = await this.validateGuild(guild);
    await this.provider.create(this.type, target.id, this.schemaManager.defaults);
    super.set(target.id, this.schemaManager.defaults);
  }

  /**
   * Remove a Guild entry from the configuration.
   * @param {Snowflake} guild The Guild object or snowflake.
   * @returns {void}
   */
  async destroy(guild) {
    await this.provider.delete(this.type, guild);
    super.delete(this.type, guild);
  }

  /**
   * Get a Guild entry from the configuration.
   * @param {(Guild|Snowflake)} guild The Guild object or snowflake.
   * @returns {Object}
   */
  get(guild) {
    if (guild === "default") return this.schemaManager.defaults;
    return super.get(guild) || this.schemaManager.defaults;
  }

  /**
   * Get a Resolved Guild entry from the configuration.
   * @param {(Guild|Snowflake)} guild The Guild object or snowflake.
   * @returns {Object}
   */
  async getResolved(guild) {
    guild = await this.validate(guild);
    const settings = this.get(guild.id);
    const resolved = await Promise.all(Object.entries(settings).map(([key, data]) => {
      if (this.schema[key] && this.schema[key].array) return { [key]: Promise.all(data.map(entry => this.resolver[this.schema[key].type.toLowerCase()](entry, guild, this.schema[key]))) };
      return { [key]: this.schema[key] && data ? this.resolver[this.schema[key].type.toLowerCase()](data, guild, this.schema[key]) : data };
    }));
    return Object.assign({}, ...resolved);
  }

  /**
   * Sync either all Guild entries from the configuration, or a single one.
   * @param {(Guild|Snowflake)} [guild=null] The configuration for the selected Guild, if specified.
   * @returns {void}
   */
  async sync(guild = null) {
    if (!guild) {
      const data = await this.provider.getAll(this.type);
      if (this.sql) for (let i = 0; i < data.length; i++) this.sql.deserializer(data[i]);
      for (const key of data) super.set(key.id, key);
      return;
    }
    const target = await this.validateGuild(guild);
    const data = await this.provider.get(this.type, target.id);
    if (this.sql) this.sql.deserializer(data);
    await super.set(target.id, data);
  }

  /**
   * Reset a key's value to default from a Guild configuration.
   * @param {(Guild|Snowflake)} guild The Guild object or snowflake.
   * @param {string} key The key to reset.
   * @returns {*}
   */
  async reset(guild, key) {
    const target = await this.validateGuild(guild);
    if (!(key in this.schema)) throw `The key ${key} does not exist in the current data schema.`;
    const defaultKey = this.schema[key].default;
    await this.provider.update(this.type, target.id, { [key]: defaultKey });
    this.sync(target.id);
    return defaultKey;
  }

  /**
   * Update a Guild's configuration.
   * @param {(Guild|Snowflake)} guild The Guild object or snowflake.
   * @param {string} key The key to update.
   * @param {any} data The new value for the key.
   * @returns {any}
   */
  async update(guild, key, data) {
    if (!(key in this.schema)) throw `The key ${key} does not exist in the current data schema.`;
    const target = await this.validateGuild(guild);
    let result = await this.resolver[this.schema[key].type.toLowerCase()](data, target, this.schema[key]);
    if (result.id) result = result.id;
    await this.provider.update(this.type, target.id, { [key]: result });
    await this.sync(target.id);
    return result;
  }

  /**
   * Update an array from the a Guild's configuration.
   * @param {(Guild|Snowflake)} guild The Guild object or snowflake.
   * @param {string} type Either 'add' or 'remove'.
   * @param {string} key The key from the Schema.
   * @param {any} data The value to be added or removed.
   * @returns {boolean}
   */
  async updateArray(guild, type, key, data) {
    if (!["add", "remove"].includes(type)) throw "The type parameter must be either add or remove.";
    if (!(key in this.schema)) throw `The key ${key} does not exist in the current data schema.`;
    if (!this.schema[key].array) throw `The key ${key} is not an Array.`;
    if (data === undefined) throw "You must specify the value to add or filter.";
    const target = await this.validate(guild);
    let result = await this.resolver[this.schema[key].type.toLowerCase()](data, target, this.schema[key]);
    if (result.id) result = result.id;
    const cache = this.get(target.id);
    if (type === "add") {
      if (cache[key].includes(result)) throw `The value ${data} for the key ${key} already exists.`;
      cache[key].push(result);
      await this.provider.update(this.type, target.id, { [key]: cache[key] });
      await this.sync(target.id);
      return result;
    }
    if (!cache[key].includes(result)) throw `The value ${data} for the key ${key} does not exist.`;
    cache[key] = cache[key].filter(v => v !== result);
    await this.provider.update(this.type, target.id, { [key]: cache[key] });
    await this.sync(target.id);
    return true;
  }
};
