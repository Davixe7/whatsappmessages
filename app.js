const express = require('express');
const app = express()

const mongoose = require('mongoose')
const { MongoStore } = require('wwebjs-mongo');
const store = new MongoStore(mongoose)
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js')

var qrcode = require('qrcode')
const { v4: uuidv4 } = require('uuid');

const axios = require('axios')

mongoose.connect('mongodb://localhost/wweb').then(() => { })

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

  console.log('Client created ' + clientId)

  setClientDefaultListeners(client)

  client.initialize();
  console.log('Initializing client')
  return client;
}

async function findClient(instance_id) {
  let exists = await store.sessionExists({ session: `RemoteAuth-${instance_id}` })
  if (!exists && !clients.hasOwnProperty(instance_id)) return null

  let client = null

  if (clients.hasOwnProperty(instance_id)) {
    console.log('Client found in memory')
    return clients[instance_id]
  };

  console.log('Client found in DB')
  client = createClient(instance_id)
  clients[instance_id] = client
  return client;
}

function setClientDefaultListeners(client) {
  console.log('Setting client default listeners')

  client.on('qr', qrcontent => {
    qrcode.toDataURL(qrcontent, (err, url) => availableClient.qr = url)
  });

  client.on('ready', () => {
    console.log('Client ready!')
    if (client.options.authStrategy.clientId == availableClient.id) {
      availableClient.authenticated = true
    }
    clients[client.options.authStrategy.clientId] = client
    console.log('Client info')
    console.log(client.info)
  });
}

app.get('/create_instance', async (req, res) => {
  if (availableClient.id && !availableClient.authenticated) {
    res.send({ instance_id: availableClient.id })
    return
  }

  availableClient.authenticated = false
  availableClient.client        = createClient()
  availableClient.id            = availableClient.client.options.authStrategy.clientId

  res.send({ instance_id: availableClient.id })
})

app.get('/set_webhook', async (req, res) => {
  if (availableClient.id && !availableClient.authenticated) {
    if (!req.query.instance_id) { res.status(422).send({ message: 'instance_id is required' }); return }
    if (!req.query.webhook_url) { res.status(422).send({ message: 'Webhook url is required' }); return }
    if (req.query.instance_id != availableClient.id) { res.status(422).send({ message: 'Instance ID invalidated' }); return }

    availableClient.webhook_url = req.query.webhook_url

    availableClient.client.once('ready', () => {
      console.log(availableClient.client.info)
      axios.get(req.query.webhook_url, {
        params: { event: 'ready', instance_id: availableClient.id, phone: availableClient.client.info.wid.user }
      })
        .then(res => console.log('Webhook set successfully'))
        .catch(err => { console.log(err); console.log(err.response) })
    })

    res.send({ 'message': 'Webhook set successfully', 'status': 'success' })
    return
  }
  res.send('Instance ID invalidated')
})

app.get('/get_qrcode', (req, res) => {
  if (!req.query.instance_id) {
    res.status(422).send('instance_id field is required')
    return;
  }

  if (availableClient.authenticated || availableClient.id != req.query.instance_id) {
    res.send('instance ID invalidated')
    return;
  }

  res.send({ base64: availableClient.qr, status: 'success' })
})

app.get('/find', async (req, res) => {
  let data = await store.sessionExists({ session: `RemoteAuth-${req.query.instance_id}` });

  if (!data && !clients.hasOwnProperty(req.query.instance_id)) {
    res.send('Session does not exist ')
    return
  }

  if (clients.hasOwnProperty(req.query.instance_id)) {
    res.send({
      status: 'success',
      message: 'Client found in memory',
      info: clients[req.query.instance_id].info,
      state: clients[req.query.instance_id].status
    })
    return
  }

  createClient(req.query.instance_id)
  res.send({
    status: 'success',
    message: 'Client found in DB',
    info: 'Not available until ready'
  })
})

app.get('/send', async (req, res) => {
  if (!req.query.instance_id) {
    res.status(422).send({ message: 'instance_id field is required' });
    return
  }

  if (!req.query.phone) {
    res.status('422').send({ message: 'phone field is required' });
    return
  }

  if (!req.query.body) {
    res.status('422').send({ message: 'body field is required' });
    return
  }

  let client = await findClient(req.query.instance_id)
  let media = req.query.media_url ? await MessageMedia.fromUrl(req.query.media_url) : null
  let options = media
    ? { media, caption: req.query.body }
    : {}

  if (!client) { res.status(404).send({ status: 'error', message: 'Instance id not found or invalidated' }); return; }

  if (client.info) {
    console.log('Sending message ready')
    client.sendMessage(`${req.query.phone}@c.us`, req.query.body, options)
  }
  else {
    console.log('Sending message deferred')
    client.once('ready', () => {
      client.sendMessage(`${req.query.phone}@c.us`, req.query.body, options)
    })
  }

  res.send({ message: 'Message sent successfully' })
  return

})

app.get('/logout', async (req, res) => {
  let client = await findClient(req.query.instance_id)

  if (!client) {
    res.send({ status: 'success', message: 'Session already closed' })
    return
  }

  if (client.info) {
    await client.logout()
    await store.delete({ session: req.query.instance_id });
    delete clients[req.query.instance_id];

    res.send({ status: 'success', message: 'Logout successfully' })
    return
  }

  client.once('ready', async () => {
    await client.logout()
    delete clients[req.query.instance_id];
  })
  res.send({ status: 'success', message: 'Logout in progress' })
})

app.listen(3000, () => console.log('Hello, newbie!')) 
