# Jaman Store

Responsive VITAFOAM storefront operated by Jaman Business Company.

## Included
- Mobile-first storefront
- VITAFOAM mattress and pillow catalogue
- Search/category filters
- Mattress-size selection
- Persistent cart and checkout form
- Server-side Paystack initialization and verification
- Paystack webhook signature validation
- Payment-success page
- Existing Paystack Shop fallback link

## Paystack setup
Never place the Paystack secret key in `index.html`.

For Vercel, add:
- `PAYSTACK_SECRET_KEY` — Paystack secret key
- `SITE_URL` — deployed website URL, e.g. `https://your-domain.com`

Webhook URL:
`https://your-domain.com/api/paystack/webhook`

The server recalculates the cart total from its own catalogue instead of trusting browser prices, then verification checks transaction status and expected amount.

## Deployment
The `api/` directory uses Node.js serverless functions and is intended for a Vercel-style deployment. GitHub Pages can host the static page but cannot execute these Paystack server functions.

Availability, final size-specific pricing, delivery charges and fulfilment should still be confirmed by Jaman Store.
