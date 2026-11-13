/** Notes: grid with pinning, colour labels, categories and search. */

import { h, clear } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { formatDate } from '../core/dates.js';
import { openNoteDialog, deleteEntity } from '../ui/forms.js';
import { emptyState, iconButton, primaryButton } from '../ui/controls.js';

export default function notesView(ctx) {
  const state = ctx.viewState.notes || (ctx.viewState.notes = { query: '' });
  let gridHost = null;

  function filtered() {
    const query = state.query.toLowerCase();
    return ctx.store
      .all('notes')
      .filter((note) => {
        if (!query) return true;
        return (
          note.title.toLowerCase().includes(query) ||
          note.body.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  }

  function noteCard(note) {
    const card = h(
      'div.note-card' + (note.pinned ? '.note-card--pinned' : ''),
      {
        role: 'button',
        tabindex: '0',
        style: { '--note-color': `var(--label-${note.color})` },
        on: {
          click: () => openNoteDialog(ctx, { note }),
          keydown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openNoteDialog(ctx, { note });
            }
          }
        }
      },
      h('div.note-card__title', { text: note.title || t('common.untitled') }),
      note.body ? h('div.note-card__body', { text: note.body }) : null,
      h('div.note-card__meta', {
        text: t('notes.updated', { date: formatDate(note.updatedAt, ctx.getLang(), { day: 'numeric', month: 'short' }) })
      })
    );
    const actions = h(
      'div.row',
      { style: { gap: '2px', marginTop: 'auto' } },
      iconButton(
        'pin',
        note.pinned ? t('notes.unpin') : t('notes.pin'),
        (event) => {
          event.stopPropagation();
          ctx.store.put('notes', { ...note, pinned: !note.pinned });
          ctx.afterChange('notes');
        },
        { small: true }
      ),
      iconButton(
        'trash',
        t('common.delete'),
        (event) => {
          event.stopPropagation();
          deleteEntity(ctx, 'notes', note, { title: t('common.delete'), text: note.title });
        },
        { small: true }
      )
    );
    card.appendChild(actions);
    return card;
  }

  function renderGrid() {
    if (!gridHost) return;
    clear(gridHost);
    const notes = filtered();
    if (!notes.length) {
      gridHost.appendChild(
        state.query
          ? emptyState({ icon: 'search', title: t('notes.noResults') })
          : emptyState({
              icon: 'note',
              title: t('notes.emptyTitle'),
              text: t('notes.emptyText'),
              action: primaryButton(t('notes.new'), () => openNoteDialog(ctx), {
                variant: 'tonal',
                icon: 'plus',
                block: true
              })
            })
      );
      return;
    }
    const pinned = notes.filter((note) => note.pinned);
    const others = notes.filter((note) => !note.pinned);

    if (pinned.length) {
      gridHost.appendChild(h('h2.section-title', null, h('span', { text: t('notes.pinned') })));
      const grid = h('div.notes-grid');
      pinned.forEach((note) => grid.appendChild(noteCard(note)));
      gridHost.appendChild(grid);
    }
    if (others.length) {
      if (pinned.length) gridHost.appendChild(h('h2.section-title', null, h('span', { text: t('notes.others') })));
      const grid = h('div.notes-grid');
      others.forEach((note) => grid.appendChild(noteCard(note)));
      gridHost.appendChild(grid);
    }
  }

  function render() {
    const root = h('div.stack');
    const search = h('input', {
      type: 'search',
      placeholder: t('notes.searchPlaceholder'),
      'aria-label': t('notes.searchPlaceholder'),
      value: state.query
    });
    let timer = 0;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = search.value.trim();
        renderGrid();
      }, 160);
    });
    root.appendChild(h('div.search-field', null, iconNode('search'), search));
    gridHost = h('div.stack');
    root.appendChild(gridHost);
    renderGrid();
    return root;
  }

  return {
    render,
    update() {
      renderGrid();
      return true;
    },
    fab() {
      return { icon: 'plus', label: t('notes.new'), onClick: () => openNoteDialog(ctx) };
    },
    appBarActions() {
      return [iconButton('plus', t('notes.new'), () => openNoteDialog(ctx), { small: true })];
    }
  };
}
