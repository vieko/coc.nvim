import {Neovim} from 'neovim'
import {CompleteOption, VimCompleteItem} from './types'
import {getConfig} from './config'
import Input from './model/input'
import completes from './completes'
const logger = require('./util/logger')('increment')

export interface CompleteDone {
  word: string
  timestamp: number
  colnr: number
  linenr: number
}

export interface InsertedChar {
  character: string
  timestamp: number
}

export interface ChangedI {
  linenr: number
  colnr: number
}

const MAX_DURATION = 50

export default class Increment {
  private nvim:Neovim
  public activted: boolean
  public input: Input | null | undefined
  public done: CompleteDone | null | undefined
  public lastInsert: InsertedChar | null | undefined
  public option: CompleteOption | null | undefined
  public changedI: ChangedI | null | undefined
  public maxDoneCount: number

  constructor(nvim:Neovim) {
    this.activted = false
    this.nvim = nvim
    this.maxDoneCount = 0
  }

  public async stop():Promise<void> {
    if (!this.activted) return
    this.activted = false
    if (this.input) await this.input.clear()
    this.done = this.input = this.option = this.changedI = null
    this.maxDoneCount = 0
    let completeOpt = getConfig('completeOpt')
    completes.reset()
    await this.nvim.call('execute', [`noa set completeopt=${completeOpt}`])
    logger.debug('increment stopped')
  }

  /**
   * start
   *
   * @public
   * @param {string} input - current user input
   * @param {string} word - the word before cursor
   * @returns {Promise<void>}
   */
  public async start(input: string, word: string, hasInsert:boolean):Promise<void> {
    let {nvim, activted, option} = this
    if (activted || !option) return
    let {linenr, col} = option
    // clear beginning input
    if (this.input) {
      await this.input.clear()
      this.input = null
    }

    let inputTarget = new Input(nvim, input, word, linenr, col)
    if (inputTarget.isValid) {
      this.maxDoneCount = hasInsert ? 1 : 0
      this.activted = true
      this.input = inputTarget
      await inputTarget.highlight()
      let opt = this.getNoinsertOption()
      await nvim.call('execute', [`noa set completeopt=${opt}`])
      logger.debug('increment started')
    } else {
      this.option = this.changedI = null
    }
  }

  public setOption(opt: CompleteOption):void {
    this.option = opt
  }

  public async onCompleteDone(item: VimCompleteItem | null, isCoc:boolean):Promise<boolean> {
    let {nvim, maxDoneCount} = this
    let [_, lnum, colnr] = await nvim.call('getcurpos', [])
    if (isCoc && maxDoneCount == 0) {
      logger.debug('complete done, increment stopped')
      await this.stop()
      return false
    }
    if (isCoc) this.maxDoneCount = maxDoneCount - 1
    this.done = {
      word: item ? item.word || '' : '',
      timestamp: Date.now(),
      colnr: colnr as number,
      linenr: lnum as number,
    }
    return isCoc
  }

  public async onCharInsert():Promise<void> {
    let ch:string = (await this.nvim.getVvar('char') as string)
    this.lastInsert = {
      character: ch,
      timestamp: Date.now()
    }
    logger.debug('char insert')
    let {activted} = this
    if (!activted) return
    let {chars} = completes
    if (chars.indexOf(ch) == -1) {
      logger.debug('character not found')
      await this.stop()
      return
    }
    // vim would attamp to match the string
    // if vim find match, no TextChangeI would fire
    // we should disable this behavior by
    // send <C-e> to hide the popup
    let visible = await this.nvim.call('pumvisible')
    if (visible) await this.nvim.call('coc#_hide')
  }

  // keep other options
  private getNoinsertOption():string {
    let opt = getConfig('completeOpt')
    let parts = opt.split(',')
    parts.filter(s => s != 'menu')
    if (parts.indexOf('menuone') === -1) {
      parts.push('menuone')
    }
    if (parts.indexOf('noinsert') === -1) {
      parts.push('noinsert')
    }
    return parts.join(',')
  }

  public async onTextChangeI():Promise<boolean> {
    logger.debug('text changed')
    let {option, activted, done, lastInsert, nvim} = this
    if (!activted) return false
    let [_, linenr, colnr] = await nvim.call('getcurpos', [])
    let ts = Date.now()
    if (!done
      || linenr != option.linenr
      || ts - done.timestamp > MAX_DURATION) {
      await this.stop()
      return false
    }
    let lastChanged = Object.assign({}, this.changedI)
    this.changedI = {
      linenr,
      colnr
    }
    // check continue
    if (lastInsert
      && ts - lastInsert.timestamp < MAX_DURATION
      && colnr - lastChanged.colnr === 1) {
      await this.input.addCharactor(lastInsert.character)
      return true
    }
    // TODO might be need to improve
    if (lastChanged.colnr - colnr === 1) {
      let invalid = await this.input.removeCharactor()
      if (!invalid) return true
    }
    logger.debug('increment failed')
    await this.stop()
    return false
  }
}