const h = require('mutant/html-element')
const Value = require('mutant/value')
const MutantArray = require('mutant/array')
const MutantMap = require('mutant/map')
const computed = require('mutant/computed')
const prettyBytes = require('pretty-bytes')
const blobFiles = require('ssb-blob-files')
const setStyle = require('module-styles')('tre-images')
const Str = require('tre-string')
const dropzone = require('tre-dropzone')

setStyle(`
  .tre-images-editor .tre-dropzone {
    min-width: 400px;
    min-height: 50px;
    border-radius: 20px;
    border: 8px dashed #eee;
    padding: 1em;
    margin: 1em;
  }
  .tre-images-editor .tre-dropzone.drag {
    border-color: #777;
  }
  .tre-images-editor .list {
    display: grid; 
    grid-template-columns: 4em 3em 1fr 5em 4em; 
    width: min-content;
  }
  .tre-images-editor .list > * {
    margin: .1em .2em;
    background-color: #ddd;
  }
  .tre-images-editor .list > .lang,
  .tre-images-editor .list > img {
    grid-column-start: 2;
    grid-column-end: span 4;
    max-width: 300px;
    width: 100%;
    height: auto;
  }
  .tre-images-editor .placeholder {
    color: #555;
  }
`)

function renderImagePreview(file) {
  return h('img', {
    src: srcObv(file)
  })
}

function RenderImage(ssb) {
  const blobPrefix = Value()
  ssb.ws.getAddress((err, address) => {
    if (err) return console.error(err)
    address = address.replace(/^ws:\/\//, 'http://').replace(/~.*$/, '/blobs/get/')
    blobPrefix.set(address)
  })
  
  return function renderImage(kv, ctx) {
    const i18n = content.i18n || {}
    
    const lang = ctx.lang || i18n.keys()[0]
    const src = computed([blobPrefix, lang], (bp, l) => {
      if (!i18n[l]) l = i18n.keys()[0]
      if (!i18n[l]) return '' 
      return bp + encodeURIComponent(i18n[l].src)
    })
    
    return h('img',{
      attributes: {
        src,
        "data-key": kv.key
      }
    }) 
  }
}


function RenderEditor(ssb, opts) {
  return function renderEditor(kv, ctx) {
    const content = kv.value && kv.value.content
    const files = MutantArray(content.files || [])
    const stati = MutantArray() 
    const langs = MutantArray() 
    const name = Value(content.name)

    renderStr = Str({
      save: text => {
        name.set(text)
        console.log('new name', text)
      }
    })

    function removeButton(file) {
      return h('button', {
        'ev-click': e => {
          const entry = files.find( f => f.name == file.name) 
          console.log('entry', entry)
          if (entry) files.delete(entry)
        }
      }, 'remove')
    }
    
    function renderItem(file) {
      const i = files.indexOf(file)
      const status = computed(stati, s => {
        return s[i] ? s[i] :  ''
      })
      const lang = computed(langs, l => {
        return l[i] ? l[i] :  'en'
      })
      const renderLang = Str({ save: text => { langs.put(i, text) } })

      return [
        removeButton(file),
        h('span', status),
        h('span', file.name),
        h('span', file.type),
        h('span', prettyBytes(file.size)),
        renderImagePreview(file),
        h('div.lang', [
          h('span', 'language:'),
          renderLang(lang)
        ])
      ]
    }

    const renderList = function(arr) {
      const placeholder = h('span.placeholder', 'Drag image files here')

      const entries = computed(arr, a => {
        return a.length ? h('.list', 
          MutantMap(arr, renderItem)) :
          placeholder
      })
      return entries
    }

    return h('.tre-images-editor', [
      h('h1', renderStr(computed(name, n => n ? n : 'No Name'))),
      h('p.description', `
        Drag Jpeg or Png files to the box below. Then change the title above to a descriptive name by clicking on it. You can provide multiple files, but you don't have to. If you do, they should be different language versions of the smae thing. You will see previews of the images below and you can change the two letter language codes next to them. If the image is language-neutral, just leave it at 'en'.  Click 'Apply' to save your changes.
      `),
      dropzone({
        on_file_drop: file => {
          if (!name()) name.set(titleize(file.name))
          files.push(file)
        }
      }, [renderList(files)]),
      h('button', {
        'ev-click': e => {
          importFiles(ssb, files(), stati, (err, results) => {
            if (err) return console.error(err)
            const i18n = {}
            for(let i=0; i < results.length; ++i) {
              const {link, size, type} = results[i].result
              i18n[langs()[i]||'en'] = {
                src: link,
                size,
                type
              }
            }
            const content = {
              type: 'image',
              name: name(),
              i18n
            }
            if (opts.save) opts.save(content)
          })
        }
      }, 'Apply')
    ])
  }
}

module.exports = function(ssb, opts) {
  opts = opts || {}
  const renderEditor = RenderEditor(ssb, opts)
  const renderImage = RenderImage(ssb)

  return function render(kv, ctx) {
    ctx = ctx || {}
    const content = kv.value && kv.value.content
    if (content.type !== 'image') return

    if (ctx.where == 'editor') {
      return renderEditor(kv, ctx)
    }
    return renderImage(kv, ctx)
  }
}

module.exports.importFile = function importFile(ssb, file, opts, cb) {
  opts = opts || {}

  if (!/^image\//.test(file.type)) return cb(true)
  const stati = MutantArray(opts.progress || Value(false))
  importFiles(ssb, [file], stati, (err, results) => {
    if (err) return cb(err)
    const name = titleize(file.name)
    const {link, size, type} = results[0].result
    const content = {
      type: 'image',
      name,
      i18n: {
        en: {src: link, size, type}
      }
    }
    return cb(null, content)
  })
}

// -- utils

function srcObv(file) {
  const uri = Value('')
  dataUri(file, (err, _uri) => {
    if (err) return console.error(err.message)
    uri.set(_uri)
  })
  return uri
}

function titleize(filename) {
  return filename.replace(/\.\w{3,4}$/, '').replace(/-/g, ' ')
}

function dataUri(file, cb) {
  const reader = new global.FileReader()
  reader.onload = e => cb(null, e.target.result)
  reader.readAsDataURL(file)
}

function importFiles(ssb, files, stati, cb) {
  const n = files.length
  if (!n) return cb(null)
  if (stati().length !== n) {
    stati.set(Array(n).map(x => Value(false)))
  }
  let i=0
  const results = []
  let err = null
  blobFiles(files, ssb, (_err, result) => {
    if (_err) stat.put(i, _err)
    else stati.put(i, true)
    if (_err) err = _err
    results.push({_err, result})
    if (++i == n) cb(err, results)
  })
}
