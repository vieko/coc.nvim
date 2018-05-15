"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const config_1 = require("./config");
const input_1 = require("./model/input");
const completes_1 = require("./completes");
const logger = require('./util/logger')('increment');
const MAX_DURATION = 50;
class Increment {
    constructor(nvim) {
        this.activted = false;
        this.nvim = nvim;
        this.maxDoneCount = 0;
    }
    stop() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.activted)
                return;
            this.activted = false;
            if (this.input)
                yield this.input.clear();
            this.done = this.input = this.option = this.changedI = null;
            this.maxDoneCount = 0;
            let completeOpt = config_1.getConfig('completeOpt');
            completes_1.default.reset();
            yield this.nvim.call('execute', [`noa set completeopt=${completeOpt}`]);
            logger.debug('increment stopped');
        });
    }
    /**
     * start
     *
     * @public
     * @param {string} input - current user input
     * @param {string} word - the word before cursor
     * @returns {Promise<void>}
     */
    start(input, word, hasInsert) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let { nvim, activted, option } = this;
            if (activted || !option)
                return;
            let { linenr, col } = option;
            // clear beginning input
            if (this.input) {
                yield this.input.clear();
                this.input = null;
            }
            let inputTarget = new input_1.default(nvim, input, word, linenr, col);
            if (inputTarget.isValid) {
                this.maxDoneCount = hasInsert ? 1 : 0;
                this.activted = true;
                this.input = inputTarget;
                yield inputTarget.highlight();
                let opt = this.getNoinsertOption();
                yield nvim.call('execute', [`noa set completeopt=${opt}`]);
                logger.debug('increment started');
            }
            else {
                this.option = this.changedI = null;
            }
        });
    }
    setOption(opt) {
        this.option = opt;
    }
    onCompleteDone(item, isCoc) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let { nvim, maxDoneCount } = this;
            let [_, lnum, colnr] = yield nvim.call('getcurpos', []);
            if (isCoc && maxDoneCount == 0) {
                logger.debug('complete done, increment stopped');
                yield this.stop();
                return false;
            }
            if (isCoc)
                this.maxDoneCount = maxDoneCount - 1;
            this.done = {
                word: item ? item.word || '' : '',
                timestamp: Date.now(),
                colnr: colnr,
                linenr: lnum,
            };
            return isCoc;
        });
    }
    onCharInsert() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let ch = yield this.nvim.getVvar('char');
            this.lastInsert = {
                character: ch,
                timestamp: Date.now()
            };
            logger.debug('char insert');
            let { activted } = this;
            if (!activted)
                return;
            let { chars } = completes_1.default;
            if (chars.indexOf(ch) == -1) {
                logger.debug('character not found');
                yield this.stop();
                return;
            }
            // vim would attamp to match the string
            // if vim find match, no TextChangeI would fire
            // we should disable this behavior by
            // send <C-e> to hide the popup
            let visible = yield this.nvim.call('pumvisible');
            if (visible)
                yield this.nvim.call('coc#_hide');
        });
    }
    // keep other options
    getNoinsertOption() {
        let opt = config_1.getConfig('completeOpt');
        let parts = opt.split(',');
        parts.filter(s => s != 'menu');
        if (parts.indexOf('menuone') === -1) {
            parts.push('menuone');
        }
        if (parts.indexOf('noinsert') === -1) {
            parts.push('noinsert');
        }
        return parts.join(',');
    }
    onTextChangeI() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            logger.debug('text changed');
            let { option, activted, done, lastInsert, nvim } = this;
            if (!activted)
                return false;
            let [_, linenr, colnr] = yield nvim.call('getcurpos', []);
            let ts = Date.now();
            if (!done
                || linenr != option.linenr
                || ts - done.timestamp > MAX_DURATION) {
                yield this.stop();
                return false;
            }
            let lastChanged = Object.assign({}, this.changedI);
            this.changedI = {
                linenr,
                colnr
            };
            // check continue
            if (lastInsert
                && ts - lastInsert.timestamp < MAX_DURATION
                && colnr - lastChanged.colnr === 1) {
                yield this.input.addCharactor(lastInsert.character);
                return true;
            }
            // TODO might be need to improve
            if (lastChanged.colnr - colnr === 1) {
                let invalid = yield this.input.removeCharactor();
                if (!invalid)
                    return true;
            }
            logger.debug('increment failed');
            yield this.stop();
            return false;
        });
    }
}
exports.default = Increment;
//# sourceMappingURL=increment.js.map