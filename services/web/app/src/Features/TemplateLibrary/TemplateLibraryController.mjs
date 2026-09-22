import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../Authentication/SessionManager.mjs'
import Errors from '../Errors/Errors.js'
import TemplateLibraryHandler from './TemplateLibraryHandler.mjs'
import {
  MAX_TEMPLATE_CATEGORIES,
  MAX_TEMPLATE_CATEGORY_LENGTH,
  MAX_TEMPLATE_CONTENT_LENGTH,
  MAX_TEMPLATE_DESCRIPTION_LENGTH,
  MAX_TEMPLATE_TITLE_LENGTH,
} from '../../models/TemplateSnippet.mjs'
import { parseReq, z, zz } from '../../infrastructure/Validation.mjs'

const categoriesSchema = z
  .array(z.string().trim().min(1).max(MAX_TEMPLATE_CATEGORY_LENGTH))
  .max(MAX_TEMPLATE_CATEGORIES)
  .optional()
  .default([])

const templateBodySchema = z.strictObject({
  title: z.string().trim().min(1).max(MAX_TEMPLATE_TITLE_LENGTH),
  description: z
    .string()
    .trim()
    .max(MAX_TEMPLATE_DESCRIPTION_LENGTH)
    .optional()
    .default(''),
  content: z.string().max(MAX_TEMPLATE_CONTENT_LENGTH),
  categories: categoriesSchema,
})

const templateRequestSchema = z.object({
  body: templateBodySchema,
})

const idSchema = z.object({
  params: z.strictObject({
    templateId: zz.objectId(),
  }),
})

const updateRequestSchema = z.object({
  params: z.strictObject({
    templateId: zz.objectId(),
  }),
  body: templateBodySchema,
})

const serialize = template => ({
  id: template._id.toString(),
  title: template.title,
  description: template.description,
  content: template.content,
  categories: template.categories,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
})

async function getAll(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const templates = await TemplateLibraryHandler.promises.getAll(userId)
  res.json(templates.map(serialize))
}

async function create(req, res) {
  const { body } = parseReq(req, templateRequestSchema)
  const userId = SessionManager.getLoggedInUserId(req.session)
  const template = await TemplateLibraryHandler.promises.create(userId, body)
  res.status(201).json(serialize(template))
}

async function update(req, res) {
  const { params, body } = parseReq(req, updateRequestSchema)
  const userId = SessionManager.getLoggedInUserId(req.session)
  const template = await TemplateLibraryHandler.promises.update(
    userId,
    params.templateId,
    body
  )

  if (!template) {
    throw new Errors.NotFoundError()
  }

  res.json(serialize(template))
}

async function remove(req, res) {
  const { params } = parseReq(req, idSchema)
  const userId = SessionManager.getLoggedInUserId(req.session)
  await TemplateLibraryHandler.promises.remove(userId, params.templateId)
  res.sendStatus(204)
}

async function duplicate(req, res) {
  const { params } = parseReq(req, idSchema)
  const userId = SessionManager.getLoggedInUserId(req.session)
  const template = await TemplateLibraryHandler.promises.duplicate(
    userId,
    params.templateId
  )

  if (!template) {
    throw new Errors.NotFoundError()
  }

  res.status(201).json(serialize(template))
}

export default {
  getAll: expressify(getAll),
  create: expressify(create),
  update: expressify(update),
  remove: expressify(remove),
  duplicate: expressify(duplicate),
}
