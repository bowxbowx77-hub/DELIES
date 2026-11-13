/** Shopping: lists, items with quantity, bought progress and categories. */

import { h, clear } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { openListDialog, openItemDialog, deleteEntity } from '../ui/forms.js';
import { emptyState, iconButton, primaryButton, progressBar } from '../ui/controls.js';

export default function shoppingView(ctx) {
  const state = ctx.viewState.shopping || (ctx.viewState.shopping = { listId: '' });
  let contentHost = null;

  function lists() {
    return ctx.store.all('lists').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function itemsOf(listId) {
    return ctx.store
      .find('listItems', (item) => item.listId === listId)
      .sort((a, b) => Number(a.done) - Number(b.done) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  function activeList() {
    const all = lists();
    if (!all.length) return null;
    const found = all.find((list) => list.id === state.listId);
    return found || all[0];
  }

  function itemRow(item) {
    const checkbox = h(
      'button.checkbox',
      {
        type: 'button',
        role: 'checkbox',
        'aria-checked': item.done ? 'true' : 'false',
        'aria-label': item.done ? t('tasks.markOpen') : t('tasks.markDone'),
        on: {
          click: () => {
            ctx.store.put('listItems', {
              ...item,
              done: !item.done,
              completedAt: !item.done ? new Date().toISOString() : ''
            });
            ctx.afterChange('listItems');
          }
        }
      },
      iconNode('check')
    );

    const stepper = h(
      'div.qty-stepper',
      null,
      iconButton(
        'minus',
        t('common.edit'),
        () => {
          const next = Math.max(1, item.qty - 1);
          ctx.store.put('listItems', { ...item, qty: next });
          ctx.afterChange('listItems');
        },
        { small: true }
      ),
      h('span.qty-stepper__value', { text: String(item.qty) }),
      iconButton(
        'plus',
        t('common.edit'),
        () => {
          const next = Math.min(999, item.qty + 1);
          ctx.store.put('listItems', { ...item, qty: next });
          ctx.afterChange('listItems');
        },
        { small: true }
      )
    );

    return h(
      'div.shop-item' + (item.done ? '.shop-item--done' : ''),
      null,
      checkbox,
      h(
        'div.shop-item__title',
        { role: 'button', tabindex: '0', on: { click: () => openItemDialog(ctx, { item, listId: item.listId }) } },
        item.title,
        item.unit ? h('span.small.muted', { text: ` · ${item.unit}` }) : null
      ),
      stepper,
      iconButton(
        'trash',
        t('common.delete'),
        () => {
          ctx.store.remove('listItems', item.id);
          ctx.afterChange('listItems');
        },
        { small: true }
      )
    );
  }

  function renderContent() {
    if (!contentHost) return;
    clear(contentHost);

    const all = lists();
    if (!all.length) {
      contentHost.appendChild(
        emptyState({
          icon: 'cart',
          title: t('shopping.emptyTitle'),
          text: t('shopping.emptyText'),
          action: primaryButton(t('shopping.newList'), () => openListDialog(ctx), {
            variant: 'tonal',
            icon: 'plus',
            block: true
          })
        })
      );
      return;
    }

    const list = activeList();

    if (all.length > 1) {
      const chipRowEl = h('div.chip-row');
      all.forEach((entry) => {
        chipRowEl.appendChild(
          h(
            'button.chip',
            {
              type: 'button',
              'aria-pressed': entry.id === list.id ? 'true' : 'false',
              on: {
                click: () => {
                  state.listId = entry.id;
                  renderContent();
                }
              }
            },
            entry.title
          )
        );
      });
      contentHost.appendChild(chipRowEl);
    }

    const items = itemsOf(list.id);
    const doneCount = items.filter((item) => item.done).length;
    const percent = items.length ? (doneCount / items.length) * 100 : 0;
    const category = ctx.categoryById(list.categoryId);

    contentHost.appendChild(
      h(
        'section.card',
        null,
        h(
          'div.card__header',
          null,
          h('div.card__title', { text: list.title }),
          category ? h('span.meta-dot', { style: { '--dot-color': `var(--label-${category.color})` }, text: category.name }) : null,
          iconButton('edit', t('common.edit'), () => openListDialog(ctx, { list }), { small: true }),
          iconButton(
            'trash',
            t('shopping.deleteList'),
            () => deleteEntity(ctx, 'lists', list, {
              title: t('shopping.deleteList'),
              text: t('shopping.deleteListConfirm', { title: list.title })
            }),
            { small: true }
          )
        ),
        h(
          'div.shop-progress',
          null,
          progressBar(percent, { success: percent === 100 }),
          h('span.progress-row__label', { text: `${doneCount}/${items.length}` })
        ),
        h('p.card__body', {
          text: items.length
            ? percent === 100
              ? t('shopping.allDone')
              : t('shopping.progress', { done: doneCount, total: items.length })
            : t('shopping.emptyList')
        })
      )
    );

    if (items.length) {
      const listEl = h('div.list');
      items.forEach((item) => listEl.appendChild(itemRow(item)));
      contentHost.appendChild(listEl);
      if (doneCount) {
        contentHost.appendChild(
          primaryButton(
            t('shopping.clearDone'),
            async () => {
              const ok = await ctx.confirm({ title: t('shopping.clearDone'), danger: true });
              if (!ok) return;
              ctx.store.removeMany('listItems', items.filter((item) => item.done).map((item) => item.id));
              ctx.afterChange('listItems');
            },
            { variant: 'text', icon: 'trash' }
          )
        );
      }
    }

    const input = h('input', {
      type: 'text',
      placeholder: t('shopping.itemPlaceholder'),
      'aria-label': t('shopping.itemPlaceholder'),
      maxlength: '200'
    });
    const addField = h('div.search-field', null, iconNode('plus'), input);
    const addButton = primaryButton(
      t('shopping.addItem'),
      () => {
        const value = input.value.trim();
        if (!value) {
          ctx.toast(t('shopping.itemTitleRequired'), { error: true });
          return;
        }
        ctx.store.put('listItems', { listId: list.id, title: value, qty: 1, done: false });
        input.value = '';
        ctx.afterChange('listItems');
      },
      { variant: 'filled', icon: 'plus' }
    );
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addButton.click();
      }
    });
    contentHost.appendChild(h('div.row', { style: { marginTop: '12px' } }, h('div.grow', null, addField), addButton));
    contentHost.appendChild(
      primaryButton(t('shopping.newList'), () => openListDialog(ctx), { variant: 'text', icon: 'plus', block: true })
    );
  }

  function render() {
    const root = h('div.stack');
    contentHost = h('div.stack');
    root.appendChild(contentHost);
    renderContent();
    return root;
  }

  return {
    render,
    update() {
      renderContent();
      return true;
    },
    fab() {
      const list = activeList();
      return list
        ? { icon: 'plus', label: t('shopping.addItem'), onClick: () => openItemDialog(ctx, { listId: list.id }) }
        : { icon: 'plus', label: t('shopping.newList'), onClick: () => openListDialog(ctx) };
    },
    appBarActions() {
      return [iconButton('plus', t('shopping.newList'), () => openListDialog(ctx), { small: true })];
    }
  };
}
