declare global {
  interface Window {
    dataLayer?: Record<string, any>[]
  }
}

/**
 * Internal helper to safely push events to GTM dataLayer on client side.
 */
function pushToDataLayer(payload: Record<string, any>): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
}

/**
 * Track user sign up event.
 */
export function signUp(method: string = 'email'): void {
  pushToDataLayer({
    event: 'sign_up',
    method,
  })
}

/**
 * Track user login event.
 */
export function login(method: string = 'email'): void {
  pushToDataLayer({
    event: 'login',
    method,
  })
}

/**
 * Track viewing a package detail.
 */
export function viewPackage(
  packageId: string | number,
  packageName: string,
  price: number
): void {
  pushToDataLayer({
    event: 'view_item',
    ecommerce: {
      currency: 'THB',
      value: price,
      items: [
        {
          item_id: String(packageId),
          item_name: packageName,
          price,
        },
      ],
    },
  })
}

/**
 * Track initiating the checkout flow for a package.
 */
export function beginCheckout(
  packageId: string | number,
  packageName: string,
  value: number
): void {
  pushToDataLayer({
    event: 'begin_checkout',
    ecommerce: {
      currency: 'THB',
      value,
      items: [
        {
          item_id: String(packageId),
          item_name: packageName,
          price: value,
        },
      ],
    },
  })
}

/**
 * Track successful order purchase.
 */
export function purchase(
  transactionId: string,
  packageId: string | number,
  packageName: string,
  value: number,
  currency: string = 'THB'
): void {
  pushToDataLayer({
    event: 'purchase',
    ecommerce: {
      transaction_id: transactionId,
      value,
      currency,
      items: [
        {
          item_id: String(packageId),
          item_name: packageName,
          price: value,
        },
      ],
    },
  })
}

/**
 * Track starting an exam session.
 */
export function startExam(
  examId: string | number,
  examName: string,
  category?: string
): void {
  pushToDataLayer({
    event: 'start_exam',
    exam_id: String(examId),
    exam_name: examName,
    ...(category ? { exam_category: category } : {}),
  })
}

/**
 * Track submitting an exam for grading.
 */
export function submitExam(examId: string | number): void {
  pushToDataLayer({
    event: 'submit_exam',
    exam_id: String(examId),
  })
}

/**
 * Track completing an exam and viewing final score/results.
 */
export function completeExam(
  examId: string | number,
  score: number,
  correct: number,
  wrong: number
): void {
  pushToDataLayer({
    event: 'complete_exam',
    exam_id: String(examId),
    score,
    correct_answers: correct,
    wrong_answers: wrong,
  })
}
