const pull = require('pull-stream')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const watch = require('mutant/watch')
const PropertySheet = require('tre-property-sheet')
const prettyBytes = require('pretty-bytes')
const setStyle = require('module-styles')('tre-images')
const debug = require('debug')('tre-image')
const FileSource = require('tre-file-importer/file-source')
const {makePane, makeDivider, makeSplitPane} = require('tre-split-pane')

const { importFile, parseFile } = require('./common')

module.exports = function Render(ssb, opts) {
  opts = opts || {}

  styles()
  const renderPropertySheet = PropertySheet()

  const blobPrefix = Value()
  ssb.ws.getAddress((err, address) => {
    if (err) return console.error(err)
    address = address.replace(/^ws:\/\//, 'http://').replace(/~.*$/, '/blobs/get/')
    blobPrefix.set(address)
  })

  return function render(kv, ctx) {
    ctx = ctx || {}
    const where = ctx.where || 'stage'
    const bitmap = Value()
    const exifTagsObs = Value()

    const content = kv.value.content
    if (where == 'editor') {
      return renderEditor()
    }
    if (where == 'thumbnail') {
      return renderThumbnail()
    }
    return renderCanvasOrImg(publish)

    function renderCanvasOrImg(handleFile) {
      return computed(bitmap, bitmap => {
        if (!bitmap) {
          const {exif} = content
          exifTagsObs.set(exif)
          return renderImg(handleFile)
        }
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
      })
    }

    function renderThumbnail() {
      const {thumbnail} = content
      if (!thumbnail) {
        return h('.tre-image-thumbnail', {}, 'no thumbnail')
      }
      const {meta, blob} = thumbnail
      const {width, height} = meta
      return h('img.tre-image-thumbnail', {
        src: computed(blobPrefix, bp => `${bp}${encodeURIComponent(blob)}`),
        width,
        height
      })
    }

    function renderImg(handleFile) {
      if (!content.blob) {
        return h('.tre-image.empty', dragAndDrop(handleFile))
      }
      const {width, height, blob} = content
      return h('img.tre-image', Object.assign(dragAndDrop(handleFile), {
        src: computed(blobPrefix, bp => `${bp}${encodeURIComponent(blob)}`),
        width,
        height
      }))
    }

    function renderEditor() {
      return h('.tre-images-editor', [
        makeSplitPane({horiz: true}, [
          makePane('60%', [
            renderCanvasOrImg(handleFile),
          ]),
          makeDivider(),
          makePane('40%', [
            computed(exifTagsObs, tags => {
              return renderPropertySheet(kv)
            })
          ])
        ])
      ])
    }

    function extractExif(file) {
      const parser = parseFile(file, {
        onExif: exif => exifTagsObs.set(exif)
      })
      pull(
        parser,
        pull.onEnd( err => {
          parser.end()
          if (err) console.error('err', err.message)
        })
      )
    }

    function loadBitmap(file, cb) {
      // See
      // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
      options = {} 
      global.createImageBitmap(file, options).then( bmp => {
        const old = bitmap()
        if (old) old.close()
        bitmap.set(bmp)
        if (cb) cb(null, bmp)
      }).catch( err => {
        if (err) console.error(err.message)
        bitmap.set(null)
        if (cb) cb(err)
      })
    }

    function handleFile(file) {
      extractExif(file)
      loadBitmap(file)
    }

    function publish(file) {
      loadBitmap(file, (err, bitmap) => {
        if (err) return console.error(err)
        //console.log('bitmap', bitmap)
        const {width, height} = bitmap
        importFile(ssb, file, FileSource(file), {}, (err, content) => {
          if (err) return console.error(err.message)
          console.log('imported', content)
        })
      })
    }

  }
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
    .tre-images-editor .tre-image {
      width: 100%;
      height: auto;
    }
    .tre-images-editor .tre-property-sheet {
      width: 100%;
    }
  `)
}

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
    if (!tags) return h('span', 'null') 
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

