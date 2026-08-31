import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const actions = readFileSync(join(process.cwd(), 'app/admin/packages/actions.ts'), 'utf8')

function getActionBody(actionName: string): string {
  const start = actions.indexOf(`export async function ${actionName}`)
  assert.notEqual(start, -1, `${actionName} must exist`)

  const nextAction = actions.indexOf('\nexport async function ', start + 1)
  return actions.slice(start, nextAction === -1 ? actions.length : nextAction)
}

test('all successful package mutations invalidate the public catalog', () => {
  for (const actionName of ['createPackageAction', 'updatePackageAction', 'deletePackageAction']) {
    assert.match(getActionBody(actionName), /revalidatePath\('\/packages'\)/, `${actionName} must revalidate /packages`)
  }
})

test('catalog invalidation preserves existing package route invalidation scope', () => {
  const create = getActionBody('createPackageAction')
  const update = getActionBody('updatePackageAction')
  const remove = getActionBody('deletePackageAction')

  assert.match(create, /revalidatePath\('\/admin\/packages'\)/)
  assert.match(create, /revalidatePath\('\/'\)/)
  assert.match(update, /revalidatePath\('\/admin\/packages'\)/)
  assert.match(update, /revalidatePath\(`\/package\/\$\{formData\.get\('slug'\)\}`\)/)
  assert.match(update, /revalidatePath\('\/'\)/)
  assert.match(remove, /revalidatePath\('\/admin\/packages'\)/)

  assert.doesNotMatch(actions, /revalidatePath\('\/packages\/phak-khor'\)/)
  assert.doesNotMatch(actions, /revalidatePath\(`\/(?:news|articles)\//)
})
