# ============================================================================
# FILE: command.py
# AUTHOR: Qiming Zhao <chemzqm@gmail.com>
# License: MIT license
# ============================================================================
# pylint: disable=E0401,C0411
from denite.kind.base import Base as BaseKind
from denite.source.base import Base

class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)

        self.name = 'coc-command'
        self.matchers = ['matcher_fuzzy']
        self.sorters = ['sorter/sublime']
        self.kind = SourceKind(vim)

    def define_syntax(self):
        self.vim.command('syntax case ignore')
        self.vim.command(r'syntax match deniteCommand_CocHeader /\v^.*$/ containedin=' + self.syntax_name)

    def gather_candidates(self, context):
        items = self.vim.call('CocAction', 'commands')
        candidates = []
        for item in items:
            candidates.append({
                'word': item,
                'abbr': item,
                'source__name': item
                })

        return candidates


class SourceKind(BaseKind):

    def __init__(self, vim):
        super().__init__(vim)
        self.default_action = 'run'

    def action_run(self, context):
        target = context['targets'][0]
        self.vim.call('CocAction', 'runCommand', target['source__name'])