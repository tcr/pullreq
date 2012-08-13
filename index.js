var irc = require('irc');
var client = new irc.Client('irc.dollyfish.net.nz', 'myNick', {
    channels: ['#blah'],
});
client.addListener('message', function (from, to, message) {
    console.log(from + ' => ' + to + ': ' + message);
});
