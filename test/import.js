const test = require('tape')
const {importFiles} = require('../common')
const pull = require('pull-stream')
const FileSource = require('tre-file-importer/file-source')
const {join} = require('path')

const TYPE = 'image'

test('import exif.jpeg', t => {

  let data
  const ssb = {blobs: {
    add: (cb)=> {
      return pull.collect( (err, _data) => {
        data = _data
        return cb(err, 'HASH')
      })
    }
  }}
  const file = {
    name: 'a-file-name.jpeg',
    size: 20,
    type: 'image/jpeg',
    lastModified: 2222
  }
  const opts = {
    prototypes: {
      [TYPE]: 'foo'
    }
  }
  file.source = (opts) => {
    return FileSource({path: join(__dirname,'fixtures/exif.jpeg')}, opts)
  }

  importFiles(ssb, [file], opts, (err, result) => {
    t.notOk(err, 'no error')
    //console.log(result)
    t.equal(result.type, TYPE, 'has correct type')
    t.equal(result.prototype, 'foo', 'has correct prototype')
    t.equal(result.blob, 'HASH', 'correct blob')
    delete file.source
    t.deepEqual(result.file, file, 'file is our file')
    t.ok(result.name, 'has a name')
    t.equal(result.width, 2048, 'correct width')
    t.equal(result.height, 1536, 'correct height')
    t.equal(result.format, 'jpeg', 'correct format')
    t.ok(result.thumbnail, 'has thumbnail')
    t.equal(result.thumbnail.width, 160, 'correct thumbnail width')
    t.equal(result.thumbnail.height, 120, 'correct thumbnail height')
    t.equal(result.thumbnail.blob, 'HASH', 'correct thumbnail blob')
    t.equal(result.extractedMeta.image.Orientation, 1, 'has correct image.Orientation')
    t.equal(result.extractedMeta.exif.ISO, 100, 'has correct exif.ISO')
    t.end()
  })
})

test('import beaver.jpg', t => {

  let data
  const ssb = {blobs: {
    add: (cb)=> {
      return pull.collect( (err, _data) => {
        data = _data
        return cb(err, 'HASH')
      })
    }
  }}
  const file = {
    name: 'a-file-name.jpeg',
    size: 20,
    type: 'image/jpeg',
    lastModified: 2222
  }
  const opts = {
    prototypes: {
      [TYPE]: 'foo'
    }
  }
  file.source = (opts) => {
    return FileSource({path: join(__dirname,'fixtures/beaver.jpg')}, opts)
  }

  importFiles(ssb, [file], opts, (err, result) => {
    t.notOk(err, 'no error')
    //console.log(result)
    t.equal(result.type, TYPE, 'has correct type')
    t.equal(result.prototype, 'foo', 'has correct prototype')
    t.equal(result.blob, 'HASH', 'correct blob')
    delete file.source
    t.deepEqual(result.file, file, 'file is our file')
    t.ok(result.name, 'has a name')
    t.equal(result.width, 320, 'correct width')
    t.equal(result.height, 212, 'correct height')
    t.equal(result.format, 'jpeg', 'correct format')
    t.notOk(result.thumbnail, 'has no thumbnail')
    t.equal(result.extractedMeta.exif.PixelXDimension, 320, 'has correct exif PixelXDimension')
    t.equal(result.extractedMeta.exif.PixelYDimension, 212, 'has correct exif PixelYDimension')
    t.end()
  })
})

test('import bmp_24.png', t => {

  let data
  const ssb = {blobs: {
    add: (cb)=> {
      return pull.collect( (err, _data) => {
        data = _data
        return cb(err, 'HASH')
      })
    }
  }}
  const file = {
    name: 'a-file-name.png',
    size: 20,
    type: 'image/png',
    lastModified: 2222
  }
  const opts = {
    prototypes: {
      [TYPE]: 'foo'
    }
  }
  file.source = (opts) => {
    return FileSource({path: join(__dirname,'fixtures/bmp_24.png')}, opts)
  }

  importFiles(ssb, [file], opts, (err, result) => {
    t.notOk(err, 'no error')
    //console.log(result)
    t.equal(result.type, TYPE, 'has correct type')
    t.equal(result.prototype, 'foo', 'has correct prototype')
    t.equal(result.blob, 'HASH', 'correct blob')
    delete file.source
    t.deepEqual(result.file, file, 'file is our file')
    t.ok(result.name, 'has a name')
    t.equal(result.width, 200, 'correct width')
    t.equal(result.format, 'png', 'correct format')
    t.equal(result.height, 200, 'correct height')
    t.notOk(result.thumbnail, 'has no thumbnail')
    t.end()
  })
})

test('import ball-triangle.svg', t => {

  let data
  const ssb = {blobs: {
    add: (cb)=> {
      return pull.collect( (err, _data) => {
        data = _data
        return cb(err, 'HASH')
      })
    }
  }}
  const file = {
    name: 'a-file-name.svg',
    size: 20,
    type: 'image/svg+xml',
    lastModified: 2222
  }
  const opts = {
    prototypes: {
      [TYPE]: 'foo'
    }
  }
  file.source = (opts) => {
    return FileSource({path: join(__dirname,'fixtures/circle.svg')}, opts)
  }

  importFiles(ssb, [file], opts, (err, result) => {
    t.notOk(err, 'no error')
    //console.log(result)
    t.equal(result.type, TYPE, 'has correct type')
    t.equal(result.prototype, 'foo', 'has correct prototype')
    t.equal(result.blob, 'HASH', 'correct blob')
    delete file.source
    t.deepEqual(result.file, file, 'file is our file')
    t.ok(result.name, 'has a name')
    t.equal(result.width, 226, 'correct width')
    t.equal(result.format, 'svg+xml', 'correct format')
    t.equal(result.height, 226, 'correct height')
    t.notOk(result.thumbnail, 'has no thumbnail')
    t.end()
  })
})


