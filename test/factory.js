const test = require('tape')
const {factory} = require('../common')

test('factory', t => {
  const result = factory({})
  t.ok(result.type, 'has type')
  t.ok(result.i18n.en, 'has name in english')
  t.equal(typeof result.prototype, 'function', 'has prototype function')
  t.equal(typeof result.content, 'function', 'has content function')

  const proto = result.prototype()
  t.equal(typeof proto, 'object',  'prototype() returns an object')
  t.ok(proto.type, 'prototype has type')
  t.ok(proto.schema, 'prototype has schema')

  const f = factory({tre: {prototypes: { [proto.type]: 'foo' } } })
  const content = f.content()
  t.equal(typeof content, 'object', 'content() returns an object')
  t.ok(content.type, 'content has type')
  t.equal(content.prototype, 'foo', 'content has correct prototype')

  t.end()
})
