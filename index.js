const pull = require('pull-stream')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const Str = require('tre-string')
const computed = require('mutant/computed')
const watch = require('mutant/watch')
const setStyle = require('module-styles')('tre-images')
const debug = require('debug')('tre-image')
const FileSource = require('tre-file-importer/file-source')
const BufferList = require('bl')
const svgDataUri = require('mini-svg-data-uri')

const {importFiles, factory, parseFile} = require('./common')

module.exports = function Render(ssb, opts) {
  opts = opts || {}
  const {prototypes, renderCustomElement} = opts
  if (!prototypes) throw new Error('need prototypes!')

  styles()

  const getSrcObs = Source(ssb)

  return function render(kv, ctx) {
    ctx = ctx || {}
    const where = ctx.where || 'stage'
    const content = kv.value.content
    if (!content) return
    if (content.type !== 'image') return
    const bitmapObs = Value()
    const dataURIObs = Value()
    const ownContentObs = ctx.contentObs || Value({})
    const previewObs = ctx.previewObs || Value(kv)
    const previewContentObs = computed(previewObs, kv => kv && kv.value.content)
    const thumbnailObs = computed(previewContentObs, kv => content && content.thumbnail)
    
    function set(o) {
      ownContentObs.set(Object.assign({}, ownContentObs(), o))
    }

    const renderStr = Str({
      save: text => {
        set({name: text})
      }
    })


    if (where == 'editor') {
      return renderEditor()
    } else if (['thumbnail', 'tile'].includes(where)) {
      return renderThumbnail()
    }
    return renderCanvasOrImg(upload)

    // - if bitmapObs is set, render the bitmap
    // to a canvas.
    // - if dataURIObs is set, render it as img src.
    // - Otherwise render the blob
    // referred to in content
    function renderCanvasOrImg(handleFile) {
      return computed([bitmapObs, dataURIObs], (bitmap, dataURI) => {
        if (!bitmap && !dataURI) return renderImg(previewContentObs, handleFile)
        
        if (dataURI) { 
          return h('img.tre-image', Object.assign(dragAndDrop(handleFile), {
            src: dataURI,
            width: computed(previewContentObs, c => c && c.width),
            height: computed(previewContentObs, c => c && c.height)
          }))
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

    function renderTag(cObs, opts) {
      opts = opts || {}
      const {handleFileDrop, placeholder, element} = opts
      const src = getSrcObs(cObs)
      const width = computed(cObs, content => content && content.width || 10)
      const height = computed(cObs, content => content && content.height || 10)
      const format = computed(previewContentObs, content => content && content.format) 
      return computed([src, width, height, format], (src, width, height, format) => {
        if (!src) {
          if (!placeholder) return h('.tre-image.empty', dragAndDrop(handleFileDrop))
          return placeholder({handleFileDrop})
        }
        return element({src, width, height, format, ctx, handleFileDrop})
      })
    }
    function renderImg(cObs, handleFileDrop) {
      return renderTag(cObs, {
        handleFileDrop,
        element: renderCustomElement || (({src, width, height, handleFileDrop}) => {
          return h('img.tre-image', Object.assign(dragAndDrop(handleFileDrop), {
            src, width, height
          }))
        })
      })
    }

    function renderThumbnail() {
      const formatObs = computed(previewContentObs, c => c && c.format)
      const isSmall = computed(previewContentObs, c => {
        return c && (c.width < 512 && c.height < 512)
      })
      return computed([formatObs, isSmall], (format, isSmall) => {
        if (!format) return []
        let obs = thumbnailObs
        if (format.includes('svg') || isSmall) {
          obs = previewContentObs
        }
        return renderTag(obs, {
          element: renderCustomElement || (({src, width, height}) => {
            return h('img.tre-image-thumbnail', {
              src, width, height
            })
          }),
          placeholder: ()=> h('.tre-image-thumbnail', {}, 'no thumbnail')
        })
      })
    }

    function renderEditor() {
      return h('.tre-images-editor', [
        h('h1', renderStr(computed(previewObs, kv => kv && kv.value.content.name || 'No Name'))),
        renderCanvasOrImg(upload)
      ])
    }

    function handleFile(file) {
      set({extractedMeta: {}, width: 0, height: 0})
      const parser = parseFile(file, {
        onMeta: meta => set(meta),
        onExif: extractedMeta =>{
          set({extractedMeta})
        },
        forceExifParsing: true
      })
      pull(
        parser,
        pull.onEnd( err => {
          parser.end()
          if (err) console.error('parseFile error', err.message)
        })
      )
      const c = contentObs()
      const format = c && c.format
      if (!format) {
        return console.warn('image format detection failed')
      }
      if (format.includes('svg')) {
        pull(
          file.source(),
          pull.collect( (err, buffers) => {
            if (err) {
              return console.warn('failed reading svg data')
            }
            const svgSrc = BufferList(buffers).toString()
            dataURIObs.set(svgDataUri(svgSrc))
          })
        )
        return 
      }
      loadBitmap(file, bitmapObs)
    }

    function upload(file) {
      if (file.type && file.type.includes('svg')) {
        return doImport()
      }
      
      loadBitmap(file, bitmapObs, (err, bitmap) => {
        if (err) return console.error(err)
        doImport()
      })

      function doImport() {
        importFiles(ssb, [file], {prototypes}, (err, content) => {
          if (err) return console.error(err.message)
          console.log('imported', content)
          set(content)
        })
      }
    }

  }
}

module.exports.importFiles = importFiles
module.exports.factory = factory

// -- utils

function loadBitmap(file, bitmapObs, cb) {
  // See
  // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
  options = {} 
  global.createImageBitmap(file, options).then( bmp => {
    const old = bitmapObs()
    if (old) old.close()
    bitmapObs.set(bmp)
    if (cb) cb(null, bmp)
  }).catch( err => {
    if (err) console.error('createImageBitmap error', err.message)
    const old = bitmapObs()
    if (old) old.close()
    bitmapObs.set(null)
    if (cb) cb(err)
  })
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
      function source(file) {
        return opts => FileSource(file, opts)
      }
      for(let file of files) {
        file.source = source(file)
        onfile(file)
      }
    } 
  }
}

function Source(ssb) {
  const blobPrefix = Value()
  ssb.ws.getAddress((err, address) => {
    if (err) return console.error(err)
    address = address.replace(/^ws:\/\//, 'http://').replace(/~.*$/, '/blobs/get/')
    blobPrefix.set(address)
  })

  return function getSrcObs(cObs) {
    return computed([blobPrefix, cObs], (bp, content) => {
      if (!bp) return null
      let contentType = content && content.file && content.file.type
      if (contentType == 'image/svg') contentType = 'image/svg+xml'
      const blob = content && content.blob
      if (!blob) return null
      return `${bp}${encodeURIComponent(blob)}${contentType ? '?contentType=' + encodeURIComponent(contentType) : ''}`
    })
  }
}

function styles() {
  setStyle(`
    .tre-images-editor {
      height: 100%;
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
  `)
}

