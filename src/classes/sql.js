const tuplify = s => [s.split(" ")[0], s.split(" ").slice(1).join(" ")];
const DefaultDataTypes = {
  String: "TEXT",
  Integer: "INTEGER",
  Float: "INTEGER",
  AutoID: "INTEGER PRIMARY KEY AUTOINCREMENT UNIQUE",
  Timestamp: "DATETIME",
  AutoTS: "DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL",
};

/* eslint-disable no-restricted-syntax */
/**
 * SQL driver for compatibility with SQL providers. Do NOT use this directly.
 * @class SQL
 */
class SQL {

  /**
   * Creates an instance of SQL.
   * @param {KomadaClient}   client  The Komada Client.
   * @param {SettingGateway} gateway The SettingGateway instance which initialized this instance.
   */
  constructor(client, gateway) {
    /**
     * The client this SettingsCache was created with.
     * @name SQL#client
     * @type {KomadaClient}
     * @readonly
     */
    Object.defineProperty(this, "client", { value: client });

    /**
     * The gateway which initiated this instance.
     * @name SQL#gateway
     * @type {SettingGateway}
     * @readonly
     */
    Object.defineProperty(this, "gateway", { value: gateway });
  }

  /**
   * Generate an automatic SQL schema for a single row.
   * @param {Object} value The Schema<Value> object.
   * @returns {string}
   */
  buildSingleSQLSchema(value) {
    const selectType = schemaKey => this.constants[schemaKey] || "TEXT";
    const type = value.sql || value.default ? ` DEFAULT ${this.sanitizer(value.default)}` : "";
    return `${selectType(value.type)}${type}`;
  }

  /**
   * Generate an automatic SQL schema for all rows.
   * @param {any} schema The Schema Object.
   * @returns {string[]}
   */
  buildSQLSchema(schema) {
    const output = ["id TEXT NOT NULL UNIQUE"];
    for (const [key, value] of Object.entries(schema)) {
      output.push(`${key} ${this.buildSingleSQLSchema(key, value)}`);
    }
    return output;
  }

  /**
   * Init the deserialization keys for SQL providers.
   */
  initDeserialize() {
    this.deserializeKeys = [];
    for (const [key, value] of Object.entries(this.schema)) {
      if (value.array === true) this.deserializeKeys.push(key);
    }
  }

  /**
   * Deserialize stringified objects.
   * @param {Object} data The GuildSettings object.
   */
  deserializer(data) {
    const deserialize = this.deserializeKeys;
    for (let i = 0; i < deserialize.length; i++) data[deserialize[i]] = JSON.parse(data[deserialize[i]]);
  }

  /**
   * Create/Remove columns from a SQL database, by the current Schema.
   * @param {Object} schema   The Schema object.
   * @param {Object} defaults The Schema<Defaults> object.
   * @param {string} key      The key which is updated.
   * @returns {Promise<boolean>}
   */
  async updateColumns(schema, defaults, key) {
    if (!this.provider.updateColumns) {
      this.client.emit("log", "This SQL Provider does not seem to have a updateColumns exports. Force action cancelled.", "error");
      return false;
    }
    const newSQLSchema = this.buildSQLSchema(schema).map(tuplify);
    const keys = Object.keys(defaults);
    if (!keys.includes("id")) keys.push("id");
    const columns = keys.filter(k => k !== key);
    await this.provider.updateColumns(this.gateway.type, columns, newSQLSchema);
    this.initDeserialize();

    return true;
  }

  /**
   * The constants this instance will use to build the SQL schemas.
   * @name SQL#constants
   * @type {Object}
   * @readonly
   */
  get constants() {
    return this.provider.CONSTANTS || DefaultDataTypes;
  }

  /**
   * Sanitize and prepare the strings for SQL input.
   * @name SQL#sanitizer
   * @type {Function}
   * @readonly
   */
  get sanitizer() {
    return this.provider.sanitize || (value => `'${value}'`);
  }

  /**
   * Shortcut for Schema.
   * @name SQL#schema
   * @type {Object}
   * @readonly
   */
  get schema() {
    return this.gateway.schema;
  }

  /**
   * Shortcut for Schema<Defaults>
   * @name SQL#defaults
   * @type {Object}
   * @readonly
   */
  get defaults() {
    return this.gateway.defaults;
  }

  /**
   * The provider this SettingGateway instance uses for the persistent data operations.
   * @name SQL#provider
   * @type {Resolver}
   * @readonly
   */
  get provider() {
    return this.gateway.provider;
  }

}

module.exports = SQL;
