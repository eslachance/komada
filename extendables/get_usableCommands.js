exports.conf = {
  type: "get",
  method: "usableCommands",
  appliesTo: ["Message"],
};

exports.extend = function () {
  this.client.commands.filter(command => !this.client.commandInhibitors.some((inhibitor) => {
    if (inhibitor.conf.enabled && !inhibitor.conf.spamProtection) return inhibitor.run(this.client, this, command);
    return false;
  }));
};

