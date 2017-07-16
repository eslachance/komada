const now = require("performance-now");

exports.run = async (client, msg) => {
  if (!client.ready) return;
  await this.runMessageMonitors(client, msg);
  if (!this.handleMessage(client, msg)) return;
  if (!msg.prefix || !msg.cmd) return;
  this.handleCommand(client, msg);
};

exports.runMessageMonitors = (client, msg) => {
  client.messageMonitors.forEach((monit) => {
    if (monit.conf.enabled) {
      if (monit.conf.ignoreBots && msg.author.bot) return;
      if (monit.conf.ignoreSelf && client.user === msg.author) return;
      monit.run(client, msg);
    }
  });
};

exports.handleMessage = (client, msg) => {
  // Ignore Bots if True
  if (client.config.ignoreBots && msg.author.bot) return false;
  // Ignore Self if true
  if (client.config.ignoreSelf && msg.author.id === client.user.id) return false;
  // Ignore other users if selfbot
  if (!client.user.bot && msg.author.id !== client.user.id) return false;
  // Ignore self if bot
  if (client.user.bot && msg.author.id === client.user.id) return false;
  return true;
};

exports.handleCommand = (client, msg) => {
  const start = now();
  const response = this.runInhibitors(client, msg);
  if (response) {
    if (typeof response === "string") msg.reply(response);
    return;
  }
  this.runCommand(client, msg, start);
};

exports.runCommand = (client, msg, start) => {
  msg.validateArgs()
    .then((params) => {
      msg.cmd.run(client, msg, params)
        .then(mes => this.runFinalizers(client, msg, mes, start))
        .catch(error => client.funcs.handleError(client, msg, error));
    })
    .catch((error) => {
      if (error.code === 1 && client.config.cmdPrompt) {
        return this.awaitMessage(client, msg, start, error.message)
          .catch(err => client.funcs.handleError(client, msg, err));
      }
      return client.funcs.handleError(client, msg, error);
    });
};

/* eslint-disable no-throw-literal */
exports.awaitMessage = async (client, msg, start, error) => {
  const message = await msg.channel.send(`<@!${msg.member.id}> | **${error}** | You have **30** seconds to respond to this prompt with a valid argument. Type **"ABORT"** to abort this prompt.`)
    .catch((err) => { throw client.funcs.newError(err); });

  const param = await msg.channel.awaitMessages(response => response.member.id === msg.author.id && response.id !== message.id, { max: 1, time: 30000, errors: ["time"] });
  if (param.first().content.toLowerCase() === "abort") throw "Aborted";
  msg.args[msg.args.lastIndexOf(null)] = param.first().content;
  msg.reprompted = true;

  if (message.deletable) message.delete();

  return this.runCommand(client, msg, start);
};

exports.runInhibitors = (client, msg) => {
  let response;
  client.commandInhibitors.some((inhibitor) => {
    if (inhibitor.conf.enabled) {
      response = inhibitor.run(client, msg, msg.cmd);
      if (response) return true;
    }
    return false;
  });
  return response;
};

exports.runFinalizers = (client, msg, mes, start) => {
  Promise.all(client.commandFinalizers.map(item => item.run(client, msg, mes, start)));
};
