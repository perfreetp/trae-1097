import { Router } from 'express';
import * as parkingLotCtrl from '../controllers/parkingLot.controller';
import * as parkingSpaceCtrl from '../controllers/parkingSpace.controller';
import * as eventCtrl from '../controllers/event.controller';
import * as orderCtrl from '../controllers/order.controller';
import * as benefitCtrl from '../controllers/benefit.controller';
import * as notifyCtrl from '../controllers/notification.controller';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'running', timestamp: new Date().toISOString() } });
});

const parkingLotRouter = Router();
parkingLotRouter.post('/', parkingLotCtrl.createParkingLot);
parkingLotRouter.put('/:id', parkingLotCtrl.updateParkingLot);
parkingLotRouter.get('/:id', parkingLotCtrl.getParkingLot);
parkingLotRouter.get('/', parkingLotCtrl.listParkingLots);
parkingLotRouter.delete('/:id', parkingLotCtrl.deleteParkingLot);
parkingLotRouter.post('/zones', parkingLotCtrl.createZone);
parkingLotRouter.put('/zones/:id', parkingLotCtrl.updateZone);
parkingLotRouter.get('/zones/list', parkingLotCtrl.listZones);
parkingLotRouter.delete('/zones/:id', parkingLotCtrl.deleteZone);
router.use('/parking-lots', parkingLotRouter);

const spaceRouter = Router();
spaceRouter.post('/', parkingSpaceCtrl.createParkingSpace);
spaceRouter.put('/:id', parkingSpaceCtrl.updateParkingSpace);
spaceRouter.get('/', parkingSpaceCtrl.listParkingSpaces);
spaceRouter.delete('/:id', parkingSpaceCtrl.deleteParkingSpace);
spaceRouter.post('/availability/update', parkingSpaceCtrl.updateAvailableSpaces);
spaceRouter.get('/availability/:lot_id', parkingSpaceCtrl.getLotAvailability);
router.use('/parking-spaces', spaceRouter);

const eventRouter = Router();
eventRouter.post('/entry', eventCtrl.vehicleEntry);
eventRouter.post('/exit/calculate', eventCtrl.calculateExitFee);
eventRouter.post('/exit', eventCtrl.vehicleExit);
eventRouter.get('/entry-exit', eventCtrl.listEntryExitEvents);
eventRouter.post('/abnormal', eventCtrl.reportAbnormalEvent);
eventRouter.get('/abnormal', eventCtrl.listAbnormalEvents);
eventRouter.put('/abnormal/:id/handle', eventCtrl.handleAbnormalEvent);
eventRouter.post('/device-heartbeat', eventCtrl.deviceHeartbeat);
router.use('/events', eventRouter);

const billingRouter = Router();
billingRouter.post('/rules', orderCtrl.createBillingRule);
billingRouter.put('/rules/:id', orderCtrl.updateBillingRule);
billingRouter.get('/rules', orderCtrl.listBillingRules);
billingRouter.delete('/rules/:id', orderCtrl.deleteBillingRule);
router.use('/billing', billingRouter);

const orderRouter = Router();
orderRouter.post('/', orderCtrl.createOrder);
orderRouter.get('/:id', orderCtrl.getOrder);
orderRouter.get('/no/:order_no', orderCtrl.getOrderByNo);
orderRouter.get('/', orderCtrl.listOrders);
orderRouter.post('/payment/confirm', orderCtrl.confirmPayment);
orderRouter.post('/coupon/apply', orderCtrl.applyCouponToOrder);
orderRouter.get('/unpaid/list', orderCtrl.queryUnpaidOrders);
router.use('/orders', orderRouter);

const benefitRouter = Router();
benefitRouter.post('/monthly-cards', benefitCtrl.createMonthlyCard);
benefitRouter.get('/monthly-cards/verify', benefitCtrl.verifyMonthlyCard);
benefitRouter.get('/monthly-cards', benefitCtrl.listMonthlyCards);
benefitRouter.put('/monthly-cards/:id', benefitCtrl.updateMonthlyCard);
benefitRouter.post('/coupons', benefitCtrl.createCoupon);
benefitRouter.get('/coupons/:coupon_no', benefitCtrl.getCoupon);
benefitRouter.get('/coupons', benefitCtrl.listCoupons);
benefitRouter.post('/visitor-discounts', benefitCtrl.createVisitorDiscount);
benefitRouter.get('/visitor-discounts', benefitCtrl.listVisitorDiscounts);
benefitRouter.post('/blacklist/add', benefitCtrl.addBlacklist);
benefitRouter.post('/blacklist/remove', benefitCtrl.removeBlacklist);
benefitRouter.get('/blacklist/check', benefitCtrl.checkBlacklist);
benefitRouter.get('/blacklist', benefitCtrl.listBlacklist);
router.use('/benefits', benefitRouter);

const notifyRouter = Router();
notifyRouter.post('/send', notifyCtrl.sendNotification);
notifyRouter.get('/', notifyCtrl.listNotifications);
notifyRouter.put('/:id/read', notifyCtrl.markNotificationRead);
router.use('/notifications', notifyRouter);

const invoiceRouter = Router();
invoiceRouter.post('/', notifyCtrl.createInvoiceRequest);
invoiceRouter.get('/:id', notifyCtrl.getInvoiceStatus);
invoiceRouter.put('/:id/status', notifyCtrl.updateInvoiceStatus);
router.use('/invoices', invoiceRouter);

const reconciliationRouter = Router();
reconciliationRouter.get('/report', notifyCtrl.reconciliationReport);
reconciliationRouter.get('/daily', notifyCtrl.dailyStatistics);
router.use('/reconciliation', reconciliationRouter);

const callbackRouter = Router();
callbackRouter.post('/payment', notifyCtrl.paymentCallback);
router.use('/callbacks', callbackRouter);

const logsRouter = Router();
logsRouter.get('/api-calls', notifyCtrl.listApiCallLogs);
router.use('/logs', logsRouter);

export default router;
