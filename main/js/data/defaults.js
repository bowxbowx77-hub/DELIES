/** Application constants and first-run seed data. */

export const APP_NAME = 'DELIES';
export const APP_VERSION = '2.0.0';
export const SCHEMA_VERSION = 1;
export const BRIDGE_VERSION = 1;

const SEED = {
  ru: {
    work: 'Работа',
    personal: 'Личное',
    study: 'Учёба',
    meetings: 'Встречи',
    chores: 'Дела',
    ideas: 'Идеи',
    health: 'Здоровье',
    groceries: 'Продукты',
    home: 'Дом'
  },
  uk: {
    work: 'Робота',
    personal: 'Особисте',
    study: 'Навчання',
    meetings: 'Зустрічі',
    chores: 'Справи',
    ideas: 'Ідеї',
    health: 'Здоров’я',
    groceries: 'Продукти',
    home: 'Дім'
  },
  en: {
    work: 'Work',
    personal: 'Personal',
    study: 'Study',
    meetings: 'Meetings',
    chores: 'Chores',
    ideas: 'Ideas',
    health: 'Health',
    groceries: 'Groceries',
    home: 'Home'
  }
};

/** Categories created on first launch (localised to the initial language). */
export function seedCategories(lang = 'ru') {
  const words = SEED[lang] || SEED.ru;
  return [
    { scope: 'task', name: words.work, color: 'purple' },
    { scope: 'task', name: words.personal, color: 'teal' },
    { scope: 'task', name: words.study, color: 'blue' },
    { scope: 'event', name: words.meetings, color: 'purple' },
    { scope: 'event', name: words.chores, color: 'orange' },
    { scope: 'note', name: words.ideas, color: 'amber' },
    { scope: 'reminder', name: words.health, color: 'green' },
    { scope: 'shopping', name: words.groceries, color: 'green' },
    { scope: 'shopping', name: words.home, color: 'blue' }
  ];
}

export const COLOR_NAMES = ['purple', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'grey'];

export const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

export const REMINDER_HISTORY_LIMIT = 200;
