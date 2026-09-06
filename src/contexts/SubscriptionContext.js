import { createContext, useContext } from 'react';

/**
 * Provides the live RevenueCat CustomerInfo from the App root, plus the tier
 * the server reports for this account.
 *
 * `accountTier` is 'premium', 'free', or null when it is not known yet. null is
 * deliberately not the same as 'free': the server counts comped emails as
 * premium and the client cannot see that list, so treating an unanswered sync
 * as free is what showed paying and comped users an upgrade prompt.
 *
 * Shape: { rcCustomerInfo, setRcCustomerInfo, accountTier }
 */
export const SubscriptionContext = createContext({
  rcCustomerInfo: null,
  setRcCustomerInfo: () => {},
  accountTier: null,
});

/** Returns { rcCustomerInfo, setRcCustomerInfo, accountTier } */
export const useRcCustomerInfo = () => useContext(SubscriptionContext);
