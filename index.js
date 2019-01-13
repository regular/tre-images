const pull = require('pull-stream')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const prettyBytes = require('pretty-bytes')
const setStyle = require('module-styles')('tre-images')
const exif = require('exifreader')
const imagesize = require('imagesize')
const debug = require('debug')('tre-image')

function dragAndDrop(onfile) {
  return {
    'ev-dragenter': e => {
      e.preventDefault()
      e.stopPropagation()
      e.target.classList.add('drag-hover')
    },
    'ev-dragleave': e => {
      e.preventDefault()
      e.stopPropagation()
      e.target.classList.remove('drag-hover')
    },
    'ev-dragover': e => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'all'
    },
    'ev-drop': e => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer.files || []
      for(let file of files) onfile(file)
    } 
  }
}

function renderTags(tags, name) {
  if (typeof tags == 'object') {
    
    if (Object.keys(tags).length == 2 && tags.description !== undefined) {
      return h('.key-value', [
        h('span.key', [name, '=']),
        h('span.value', tags.description)
      ])
    }

    return h('details.exif', {
      'open': true
    }, [
      h('summary', [
        h('span', name || 'exif')
      ]),
      Object.keys(tags).map(k => {
        return renderTags(tags[k], k)
      })
    ])
  }
  return h('.key-value', [
    h('span.key', name),
    h('span.value', tags)
  ])
}

module.exports = function Render(ssb, opts) {
  opts = opts || {}

  styles()

  return function render(kv, ctx) {
    ctx = ctx || {}
    const bitmap = Value()
    const exifTagsObs = Value()

    function extractExif(file) {
      const reader = new global.FileReader()
      reader.onload = ({target}) => {
        let tags
        try {
          tags = exif.load(target.result)
          exifTagsObs.set(tags)
        } catch(err) {
          exifTagsObs.set(null)
          if (err.name !== "MetadataMissingError") {
            console.error(err)
          }
        }
      }
      //reader.onerror( )
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024))
    }
    function loadBitmap(file) {
      // See
      // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
      options = {} 
      global.createImageBitmap(file, options).then( bmp => {
        const old = bitmap()
        if (old) old.close()
        bitmap.set(bmp)
      }).catch( err => {
        console.error(err)
        bitmap.set(null)
      })
    }

    function handleFile(file) {
      extractExif(file)
      loadBitmap(file)
    }

    return h('.tre-images-editor', [
      computed(bitmap, bitmap => {
        if (!bitmap) return h('.tre-image.empty', dragAndDrop(handleFile))
        return h('canvas.tre-image', Object.assign( {}, dragAndDrop(handleFile), {
          width: bitmap.width,
          height: bitmap.height,
          hooks: [canvas => {
            const ctx = canvas.getContext("bitmaprenderer")
            ctx.transferFromImageBitmap(bitmap)
            return el => {
              bitmap.close()
            }
          }]
        }))
      }),
      computed(exifTagsObs, tags => {
        if (!tags) return []
        return renderTags(tags, 'Image Properties')
      })
    ])
  }
}

module.exports.importFile = function importFile(ssb, file, source, opts, cb) {
  opts = opts || {}
  if (!/^image\//.test(file.type)) return cb(true)
  const parser = imagesize.Parser()
  let meta
  pull(
    source,
    pull.asyncMap( (b, cb) => {
      const state = parser.parse(b)
      if (!meta && state == imagesize.Parser.DONE) {
        meta = parser.getResult()
        debug('meta %o', meta)
      } else if (state == imagesize.Parser.INVALID) {
        return cb(new Error('Invalid image format'))
      }
      cb(null, b)
    }),
    ssb.blobs.add( (err, hash) => {
      if (err) return cb(err)
      const name = titleize(file.name)
      const content = {
        type: 'image',
        name,
        file,
        width: meta && meta.width,
        height: meta && meta.height,
        blob: hash
      }
      return cb(null, content)
    })
  )
}

function styles() {
  setStyle(`
    .tre-images-editor {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-auto-flow: column;
    }
    .tre-image.empty {
      width: 200px;
      height: 200px;
      border-radius: 10px;
      border: 5px #999 dashed;
    }
    .tre-image.drag-hover {
      border-radius: 10px;
      border: 5px #994 dashed;
    }
    .tre-images-editor > .tre-image {
      max-width: 250px;
    }
  `)
}

function titleize(filename) {
  return filename.replace(/\.\w{3,4}$/, '').replace(/-/g, ' ')
}
