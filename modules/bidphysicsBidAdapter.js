import {registerBidder} from 'src/adapters/bidderFactory';
import * as utils from '../src/utils';
import {BANNER} from '../src/mediaTypes';

const ENDPOINT_URL = '//exchange.bidphysics.com/auction';

const DEFAULT_BID_TTL = 30;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_NET_REVENUE = true;

export const spec = {
  code: 'bidphysics',
  aliases: ['yieldlift', 'padsquad'],
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    return (!!bid.params.unitId && typeof bid.params.unitId === 'string') || (!!bid.params.networkId && typeof bid.params.networkId === 'string');
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    if (!validBidRequests || !bidderRequest) {
      return;
    }
    const impressions = validBidRequests.map(bidRequest => ({
      id: bidRequest.bidId,
      banner: {
        format: bidRequest.sizes.map(sizeArr => ({
          w: sizeArr[0],
          h: sizeArr[1]
        }))
      },
      ext: {
        bidphysics: {
          unitId: bidRequest.params.unitId
        }
      }
    }));

    const openrtbRequest = {
      'id': bidderRequest.auctionId,
      'imp': impressions,
      'site': {
        'domain': window.location.hostname,
        'page': window.location.href,
        'ref': bidderRequest.refererInfo ? bidderRequest.refererInfo.referer || null : null// check http://prebid.org/dev-docs/bidder-adaptor.html#referrers
      },
    };

    // apply gdpr
    if (bidderRequest.gdprConsent) {
      openrtbRequest.regs = {ext: {gdpr: bidderRequest.gdprConsent.gdprApplies ? 1 : 0}};
      openrtbRequest.user = {ext: {consent: bidderRequest.gdprConsent.consentString}};
    }

    const payloadString = JSON.stringify(openrtbRequest);
    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: payloadString,
    };
  },

  interpretResponse: function (serverResponse, request) {
    const bidResponses = [];
    const response = (serverResponse || {}).body;
    // response is always one seat (bidphysics) with (optional) bids for each impression
    if (response && response.seatbid && response.seatbid.length === 1 && response.seatbid[0].bid && response.seatbid[0].bid.length) {
      response.seatbid[0].bid.forEach(bid => {
        bidResponses.push({
          requestId: bid.impid,
          cpm: bid.price,
          width: bid.w,
          height: bid.h,
          ad: bid.adm,
          ttl: DEFAULT_BID_TTL,
          creativeId: bid.crid,
          netRevenue: DEFAULT_NET_REVENUE,
          currency: DEFAULT_CURRENCY,
        })
      })
    } else {
      utils.logInfo('bidphysics.interpretResponse :: no valid responses to interpret');
    }
    return bidResponses;
  },
  getUserSyncs: function (syncOptions, serverResponses) {
    utils.logInfo('bidphysics.getUserSyncs', 'syncOptions', syncOptions, 'serverResponses', serverResponses);
    let syncs = [];

    if (!syncOptions.iframeEnabled && !syncOptions.pixelEnabled) {
      return syncs;
    }

    serverResponses.forEach(resp => {
      const userSync = utils.deepAccess(resp, 'body.ext.usersync');
      if (userSync) {
        Object.values(userSync).filter(value => value.syncs && value.syncs.length)
          .reduce((prev, curr) => {
            prev = prev.concat(curr.syncs);
            return prev;
          }, [])
          .forEach(syncDetails => {
            syncs.push({
              type: syncDetails.type === 'iframe' ? 'iframe' : 'image',
              url: syncDetails.url
            });
          });

        if (!syncOptions.iframeEnabled) {
          syncs = syncs.filter(s => s.type !== 'iframe')
        }
        if (!syncOptions.pixelEnabled) {
          syncs = syncs.filter(s => s.type !== 'image')
        }
      }
    });
    utils.logInfo('bidphysics.getUserSyncs result=%o', syncs);
    return syncs;
  },

  onTimeout: function (timeoutData) {
    // optional log
  },
  onBidWon: function (bid) {
    // optional log
  },
};
registerBidder(spec);
