const express = require('express');
const app     = express()
const cors    = require('cors')

const routes = require('./api');

app.use(cors())
app.use('/', routes);
app.listen(3000, () => console.log('Hello, newbie!')) 
