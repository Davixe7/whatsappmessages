const express = require('express');
const app = express()

const routes = require('./api');

app.use('/', routes);
app.listen(3000, () => console.log('Hello, newbie!')) 
