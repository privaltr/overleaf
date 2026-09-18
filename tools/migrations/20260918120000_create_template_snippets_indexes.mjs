import { db } from './lib/mongodb.mjs'

const migrate = async () => {
  await db.templateSnippets.createIndex(
    { user_id: 1, updatedAt: -1 },
    { name: 'template_snippets_user_updated' }
  )
}

const rollback = async () => {
  try {
    await db.templateSnippets.dropIndex('template_snippets_user_updated')
  } catch (error) {
    if (error.code !== 27 && error.codeName !== 'IndexNotFound') {
      throw error
    }
  }
}

export default {
  tags: ['server-ce', 'server-pro', 'saas'],
  migrate,
  rollback,
}
