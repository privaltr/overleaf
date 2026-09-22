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
  },
  getAll: callbackify(getAll),
  create: callbackify(create),
  update: callbackify(update),
  remove: callbackify(remove),
  duplicate: callbackify(duplicate),
}
