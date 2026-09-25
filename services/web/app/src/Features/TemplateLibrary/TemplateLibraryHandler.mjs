import mongoose from '../../infrastructure/Mongoose.mjs'
import { TemplateSnippet } from '../../models/TemplateSnippet.mjs'
import { callbackify } from '@overleaf/promise-utils'

const normalizeCategories = categories => {
  if (!Array.isArray(categories)) return []

  return [
    ...new Set(
      categories
        .filter(category => typeof category === 'string')
        .map(category => category.trim())
        .filter(Boolean)
    ),
  ]
}

const prepareTemplate = ({
  title,
  description = '',
  content,
  categories = [],
}) => ({
  title: title.trim(),
  description: description.trim(),
  content,
  categories: normalizeCategories(categories),
})

async function getAll(userId) {
  return TemplateSnippet.find({ user_id: userId })
    .sort({ updatedAt: -1, _id: -1 })
    .lean()
}

async function create(userId, data) {
  const template = await TemplateSnippet.create({
    user_id: userId,
    ...prepareTemplate(data),
  })

  return template.toObject()
}

async function update(userId, templateId, data) {
  return TemplateSnippet.findOneAndUpdate(
    { _id: templateId, user_id: userId },
    {
      $set: {
        ...prepareTemplate(data),
        updatedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  ).lean()
}

async function remove(userId, templateId) {
  await TemplateSnippet.deleteOne({
    _id: templateId,
    user_id: userId,
  })
}

async function importAll(userId, data) {
  const latestById = new Map()

  for (const template of data.templates) {
    const previous = latestById.get(template.id)
    if (
      !previous ||
      new Date(template.updatedAt).getTime() >
        new Date(previous.updatedAt).getTime()
    ) {
      latestById.set(template.id, template)
    }
  }

  const templates = Array.from(latestById.values())
  const ids = templates.map(template => new mongoose.Types.ObjectId(template.id))
  const mongoUserId = new mongoose.Types.ObjectId(userId.toString())
  const existing = await TemplateSnippet.find({
    user_id: userId,
    _id: { $in: ids },
  })
    .select({
      _id: 1,
      updatedAt: 1,
    })
    .lean()

  const existingById = new Map(
    existing.map(template => [template._id.toString(), template])
  )
  const operations = []
  let added = 0
  let replaced = 0
  let skipped = 0

  for (const template of templates) {
    const importedUpdatedAt = new Date(template.updatedAt)
    const importedCreatedAt = new Date(template.createdAt)
    const existingTemplate = existingById.get(template.id)

    if (existingTemplate) {
      if (
        importedUpdatedAt.getTime() <=
        new Date(existingTemplate.updatedAt).getTime()
      ) {
        skipped++
        continue
      }

      operations.push({
        updateOne: {
          filter: {
            _id: existingTemplate._id,
            user_id: mongoUserId,
          },
          update: {
            $set: {
              ...prepareTemplate(template),
              createdAt: importedCreatedAt,
              updatedAt: importedUpdatedAt,
            },
          },
        },
      })
      replaced++
      continue
    }

    operations.push({
      insertOne: {
        document: {
          _id: new mongoose.Types.ObjectId(template.id),
          user_id: mongoUserId,
          ...prepareTemplate(template),
          createdAt: importedCreatedAt,
          updatedAt: importedUpdatedAt,
        },
      },
    })
    added++
  }

  if (operations.length) {
    await TemplateSnippet.collection.bulkWrite(operations)
  }

  return {
    total: templates.length,
    added,
    replaced,
    skipped,
  }
}

async function duplicate(userId, templateId) {
  const source = await TemplateSnippet.findOne({
    _id: templateId,
    user_id: userId,
  }).lean()

  if (!source) return null

  const duplicate = await TemplateSnippet.create({
    user_id: userId,
    title: (source.title + ' (copy)').slice(0, 200),
    description: source.description,
    content: source.content,
    categories: source.categories,
  })

  return duplicate.toObject()
}

export default {
  promises: {
    getAll,
    create,
    update,
    remove,
    duplicate,
    importAll,
  },
  getAll: callbackify(getAll),
  create: callbackify(create),
  update: callbackify(update),
  remove: callbackify(remove),
  duplicate: callbackify(duplicate),
}
