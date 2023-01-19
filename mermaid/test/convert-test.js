/* global describe, it */
'use strict'

const { Worker } = require('../src/worker.js')
const Task = require('../src/task.js')
const puppeteer = require('puppeteer')
const chai = require('chai')
const expect = chai.expect
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)

const PNG = require('pngjs').PNG

const svgTests = [
  { content: 'Hello<br/>World' },
  { content: 'Hello<br>World' },
  { content: 'Hello<br >World' },
  { content: 'Hello<br />World' }
]

const pngTests = [
  {
    type: 'graph', width: 178, height: 168, content: `graph TD
  A --> B
  C{{test}} --> D[(db)]
  A --> D`
  },
  {
    type: 'sequence', width: 504, height: 387, content: `sequenceDiagram
  Alice->>+John: Hello John, how are you?
  Alice->>+John: John, can you hear me?
  John-->>-Alice: Hi Alice, I can hear you!
  John-->>-Alice: I feel great!`
  }
]

const invalidSyntaxTests = [
  { endpoint: 'svg' },
  { endpoint: 'png' },
  { endpoint: 'pdf' },
]

async function getBrowser () {
  return puppeteer.launch({
    args: [
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-initial-navigation',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  })
}

describe('#convert', function () {
  // Puppeteer can take some time to start
  this.timeout(10000)

  svgTests.forEach((testCase) => {
    it(`should return an XML compatible SVG with content: ${testCase.content}`, async function () {
      const browser = await getBrowser()
      try {
        const worker = new Worker(browser)
        const result = await worker.convert(new Task(`graph TD
  A{{ ${testCase.content} }}`))
        expect(result).to.contains('<span class="nodeLabel">Hello<br />World</span>')
      } finally {
        await browser.close()
      }
    })
  })

  pngTests.forEach((testCase) => {
    it(`should return a PNG for type ${testCase.type} with height=${testCase.height}, width=${testCase.width}`, async function () {
      const browser = await getBrowser()
      try {
        const worker = new Worker(browser)
        const result = await worker.convert(new Task(testCase.content, 'png'))

        const image = PNG.sync.read(result) // this will fail on invalid image

        expect(image.width).to.be.closeTo(testCase.width, 20)
        expect(image.height).to.be.closeTo(testCase.height, 50) // padding can make it vary more
      } finally {
        await browser.close()
      }
    })
  })

  invalidSyntaxTests.forEach((testCase) => {
    it(`should throw syntax error in endpoint /${testCase.endpoint}`, async function () {
      const browser = await getBrowser()
      try {
        const result = await new Worker(browser).convert(new Task('not a valid mermaid code', testCase.endpoint))
        if (testCase.endpoint === 'svg') {
          expect(result).to.contains('class="error-text">Syntax error in graph</text>')
        }
      } finally {
        await browser.close()
      }
    })
  })

  it('should properly handle <> characters', async () => {
    `sequenceDiagram
    rect rgba(200, 150, 255, 0.2)
    participant John
    Note over John: Text in <<note>>
    end`
    const browser = await getBrowser()
    try {
      const worker = new Worker(browser)
      const result = await worker.convert(new Task(`sequenceDiagram
  rect rgba(200, 150, 255, 0.2)
  participant John
  Note over John: Text in <<note>>
end`))
      expect(result).to.contains('Text in &lt;&lt;note&gt;&gt;')
    } finally {
      await browser.close()
    }
  })
})
