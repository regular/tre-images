const {client} = require('tre-client')
const Images = require('.')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const MutantArray = require('mutant/array')
const MutantMap = require('mutant/map')
const setStyle = require('module-styles')('tre-images-demo')

setStyle(`
  .tre-images-editor {
    max-width: 500px;
  }
`)

client( (err, ssb, config) => {
  if (err) return console.error(err)

  const renderImage = Images(ssb, {
    save: content => {
      console.log('new content', content)
      ssb.publish(content)
    }
  })

  const kv = {
    key: 'fake-key',
    value: {
      content: {
        type: 'image',
        files: []
      }
    }
  }

  document.body.appendChild(
    renderImage(kv, {
      where: 'editor'
    })
  )
})
