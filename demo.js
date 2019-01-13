const {client} = require('tre-client')
const Images = require('.')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
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

  const key = config.tre.branches['exif-test']
  const where = Value('editor')

  ssb.revisions.get(key, (err, kv) => {
    console.log(kv)
    document.body.appendChild(h('.tre-images-demo', [
      h('select', {
        'ev-change': e => {
          where.set(e.target.value)
        }
      }, [
        h('option', {}, 'editor'),
        h('option', {}, 'stage'),
        h('option', {}, 'thumbnail')
      ]),
      computed(where, where => renderImage(kv, {
        where
      }))
    ]))
  })
})
