import Helpers from './lib/helpers.mjs'

const indexes = [
  {
    key: { user_id: 1, updatedAt: -1 },
    name: 'template_snippets_user_updated',
  },
]

const migrate = async client => {
  const { db } = client
  await Helpers.addIndexesToCollection(db.templateSnippets, indexes)
}

const rollback = async client => {
  const { db } = client
  await Helpers.dropIndexesFromCollection(db.templateSnippets, indexes)
}

export default {
  tags: ['server-ce', 'server-pro', 'saas'],
  migrate,
  rollback,
}
