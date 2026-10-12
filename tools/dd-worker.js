// Calcule une donne double mort (appelé par build-deals.js dans un processus séparé).
const { solve } = require('./dds.js');
process.on('message', ({ hands, trump, leader, guess, id }) => {
  process.send({ id, tricks: solve(hands, trump, leader, guess) });
});
