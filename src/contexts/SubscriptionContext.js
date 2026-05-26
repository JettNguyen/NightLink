import { createContext, useContext } from 'react';

/**
 * Provides the live RevenueCat CustomerInfo from the App root.
 * Shape: { rcCustomerInfo, setRcCustomerInfo }
 */
export const SubscriptionContext = createContext({ rcCustomerInfo: null, setRcCustomerInfo: () => {} });

/** Returns { rcCustomerInfo, setRcCustomerInfo } */
export const useRcCustomerInfo = () => useContext(SubscriptionContext);
