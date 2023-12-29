const express = require('express');
const router  = express.Router();
const axios   = require('axios')

const { MessageMedia } = require('whatsapp-web.js')
const ClientManager = require('./service')
const clientManager = new ClientManager()

router.get('/create_instance', async (req, res) => {
  if (clientManager.availableClient.id && !clientManager.availableClient.authenticated) {
    res.send({ instance_id: clientManager.availableClient.id })
    return
  }

  clientManager.createClient();

  res.send({ instance_id: clientManager.availableClient.id })
})

router.get('/set_webhook', async (req, res) => {
  if (clientManager.availableClient.id && !clientManager.availableClient.authenticated) {
    if (!req.query.instance_id) { res.status(422).send({ message: 'instance_id is required' }); return }
    if (!req.query.webhook_url) { res.status(422).send({ message: 'Webhook url is required' }); return }
    if (req.query.instance_id != clientManager.availableClient.id) { res.status(422).send({ message: 'Instance ID invalidated' }); return }

    clientManager.availableClient.webhook_url = req.query.webhook_url

    clientManager.availableClient.client.once('ready', () => {
      console.log(clientManager.availableClient.client.info)
      console.log('Connecting with phenlinea.com')
      axios.get(req.query.webhook_url, {
        params: { event: 'ready', instance_id: clientManager.availableClient.id, phone: clientManager.availableClient.client.info.wid.user }
      })
        .then(res => console.log('Webhook set successfully'))
        .catch(err => { console.log(err); console.log(err.response) })
    })

    res.send({ 'message': 'Webhook set successfully', 'status': 'success' })
    return
  }
  res.send('Instance ID invalidated')
})

router.get('/get_qrcode', (req, res) => {
  if (!req.query.instance_id) {
    res.status(422).send('instance_id field is required')
    return;
  }

  if (clientManager.availableClient.authenticated || clientManager.availableClient.id != req.query.instance_id) {
    res.send('instance ID invalidated')
    return;
  }

  res.send({ base64: clientManager.availableClient.qr, status: 'success' })
})

router.get('/find', async (req, res) => {
  let client = await clientManager.findClient(req.query.instance_id);

  if (!client) {
    res.send({message: 'Session does not exist.'})
    return
  }

  if (client.info) {
    res.send({status: 'success', message: 'Client found in memory', info: client.info, state: client.status})
    return
  }

  res.send({status: 'success', message: 'Client found in DB', info: 'Not available until ready'})
  return
})

router.get('/send', async (req, res) => {
  if (!req.query.instance_id) {
    res.status(422).send({ message: 'instance_id field is required' });
    return
  }

  if (!req.query.number) {
    res.status(422).send({ message: 'number field is required' });
    return
  }

  if (!req.query.message) {
    res.status(422).send({ message: 'message field is required' });
    return
  }

  let client  = await clientManager.findClient(req.query.instance_id)
  if (!client) { res.status(404).send({ status: 'error', message: 'Instance id not found or invalidated' }); return; }

  let media   = req.query.media_url ? await MessageMedia.fromUrl(req.query.media_url, {"unsafeMime": true}) : null
  let options = media ? { media, caption: req.query.message } : {}
  let number  = req.query.group_id ? `${req.query.group_id}@g.us`: `${req.query.number}@c.us`

  if (client.info) {
    console.log('Sending message ready ' + number)
    client.sendMessage(number, req.query.message, options)
  }
  else {
    console.log('Sending message deferred')
    client.once('ready', () => client.sendMessage(number, req.query.message, options))
  }

  res.send({ message: 'Message sent successfully' })
  return

})

router.get('/logout', async (req, res) => {
  let message = await clientManager.logout(req.query.instance_id)
  res.send({ status: 'success', message })
})

module.exports = router;
