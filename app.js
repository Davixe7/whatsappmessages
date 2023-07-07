const express = require('express');
const app = express()

const mongoose = require('mongoose')
const { MongoStore } = require('wwebjs-mongo');
const store = new MongoStore(mongoose)
const { Client, RemoteAuth } = require('whatsapp-web.js')

var qrcode = require('qrcode')
const { v4: uuidv4 } = require('uuid');

const axios = require('axios')

mongoose.connect('mongodb://localhost/wweb').then(()=>{})

var clients = {}
var availableClient = {
  client: {},
  id: null,
  qr: null,
  authenticated: false,
  webhook_url: null
}

function createClient(clientId = null) {
  clientId = clientId ? clientId : uuidv4().split('-').pop()

  let client = new Client({
    authStrategy: new RemoteAuth({
      store, clientId, backupSyncIntervalMs: 300000
    })
  })

  setClientDefaultListeners(client)

  client.initialize();
  return client;
}

async function findClient(instance_id) {
  let exists = await store.sessionExists({session: `RemoteAuth-${instance_id}`})
  if( !exists  ) return null
    
  let client = null

  if ( clients.hasOwnProperty(instance_id) ) return clients[ instance_id ];

  client = createClient(instance_id)
  clients[instance_id] = client
  return client;
}

function setClientDefaultListeners(client){
  client.on('qr', qrcontent => {
    qrcode.toDataURL(qrcontent, (err, url) => availableClient.qr = url)
  });

  client.on('ready', () => {
    console.log('Client ready!')
    availableClient.authenticated = true
    clients[ availableClient.id ] = availableClient.client
  });

  client.on('authenticated', () => {
    availableClient.authenticated = true
    clients[ availableClient.id ] = availableClient.client
  });
}

app.get('/create_instance', async (req, res) => {
  if (availableClient.id && !availableClient.authenticated) {
    res.send({ client_id: availableClient.id })
    return
  }

  availableClient.client = createClient()
  availableClient.id     = availableClient.client.options.authStrategy.clientId

  res.send({ client_id: availableClient.id })
})

app.get('/set_webhook', async (req, res) => {
  if (availableClient.id && !availableClient.authenticated) {
    if (!req.query.instance_id) { res.status(422).send({message: 'instance_id is required'}); return }
    if (!req.query.webhook_url) { res.status(422).send({message: 'Webhook url is required'}); return }
    if (req.query.instance_id != availableClient.id) {res.status(422).send({message: 'Instance ID invalidated'}); return }

    availableClient.webhook_url = req.query.webhook_url
    availableClient.client.on('authenticated', () => axios.get(req.query.webhook_url)) 
    res.send({ 'message': 'Webhook set successfully' })
    return
  }
  res.send('Instance ID invalidated')
})

app.get('/get_qrcode', (req, res) => {
  if( !req.query.instance_id ){
    res.status(422).send('instance_id field is required')
    return;
  }

  if(availableClient.authenticated || availableClient.id != req.query.instance_id){
    res.send('instance ID invalidated')
    return;
  }

  res.send({ base64: availableClient.qr })
})

app.get('/find', async (req, res) => {
  let data = await store.sessionExists({session: `RemoteAuth-${req.query.instance_id}`});
  console.log( req.query.instance_id )
  console.log( data )
  res.send(data)
})

app.get('/send', async (req, res) => {
  if( !req.query.instance_id ){
    res.status('422').send({message: 'instance_id field is required'});
    return
  }

  if( !req.query.phone ){
    res.status('422').send({message: 'phone field is required'});
    return
  }

  if( !req.query.body ){
    res.status('422').send({message: 'body field is required'});
    return
  }

  let client = await findClient(req.query.instance_id)
  
  if( !client ){ res.status(404).send('Instance id not found or invalidated'); return; }

  if( client.status == 'READY' ){
    client.sendMessage(`${req.query.phone}@c.us`, req.query.body)
  }
  else{
    client.once('ready', () => client.sendMessage(`${req.query.phone}@c.us`, req.query.body))
  }

  res.send({message: 'Message sent successfully'})
  return
  
})

app.listen(3000, () => console.log('Hello, newbie!'))