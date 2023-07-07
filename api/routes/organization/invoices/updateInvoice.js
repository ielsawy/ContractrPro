const { sequelize, Invoice, InvoiceEntry } = require('../../../db')
const {
    createSuccessResponse,
    createErrorResponse,
} = require('../../../utils/response')
const { isValidUUID } = require('../../../utils/isValidUUID')
const { pick } = require('../../../utils/index')

// update invoice
// Example request body:
// {
//         "description": "Quod omnis pariatur non facere odio.",
//         "date": "2023-04-05T12:00:08.085Z",
//         "VendorId": "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
//         "InvoiceEntries": [{
//             "name": "paid joemama1",
//             "description": "whatever1",
//             "quantity": 5,
//             "unitCost": 10,
//         }]
// }
// NOTE: InvoiceEntries is optional - if provided, it will REPLACE all existing entries
// NOTE: ContractId, and JobId are optional entities to associate with the invoice
module.exports = async (req, res) => {
    try {
        const { org_id, invoice_id } = req.params
        if (!org_id || !isValidUUID(org_id)) {
            return res.status(400).json(createErrorResponse('Invalid org_id'))
        }
        if (!invoice_id || !isValidUUID(invoice_id)) {
            return res
                .status(400)
                .json(createErrorResponse('Invalid invoice_id'))
        }

        const body = {
            ...pick(req.body, [
                'invoiceNumber',
                'invoiceDate',
                'dueDate',
                'poNumber',
                'note',
                'taxRate',
                'BillToClientId',
                'ContractId',
                'JobId',
                'InvoiceEntries',
            ]),
            OrganizationId: org_id,
            UpdatedByUserId: req.auth.id,
        }

        await sequelize.transaction(async (transaction) => {
            let invoice = await Invoice.findOne({
                where: {
                    OrganizationId: org_id,
                    id: invoice_id,
                },
                transaction,
            })

            if (!invoice) {
                return res
                    .status(400)
                    .json(createErrorResponse('Invoice not found'))
            }

            await invoice.update(body, {
                transaction,
            })

            if (req.body.InvoiceEntries && req.body.InvoiceEntries.length > 0) {
                // delete all existing entries first
                await InvoiceEntry.destroy({
                    where: {
                        InvoiceId: invoice.id,
                    },
                })

                // create new entries
                await InvoiceEntry.bulkCreate(
                    req.body.InvoiceEntries.map((entry) => ({
                        ...entry,
                        InvoiceId: invoice.id,
                        UpdatedByUserId: req.auth.id,
                    })),
                    {
                        transaction,
                    }
                )

                // re-fetch invoice with entries
                invoice = await Invoice.findOne({
                    where: {
                        OrganizationId: org_id,
                        id: invoice_id,
                    },
                    transaction,
                    include: {
                        model: InvoiceEntry,
                    },
                })
            }

            res.status(200).json(createSuccessResponse(invoice))
        })
    } catch (e) {
        return res.status(400).json(createErrorResponse(e.message))
    }
}