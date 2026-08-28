<script setup lang="ts">
import {
  DROP_ACTIVE,
  DROP_CLAIMED,
  DROP_EXPIRED,
  DROP_SUCCESS,
  SELLER_SHORT,
} from './fixtures'
import CreateScreens from './screens/CreateScreens.vue'
import DropDetailScreen from './screens/DropDetailScreen.vue'
import HomeScreen from './screens/HomeScreen.vue'
import SystemScreens from './screens/SystemScreens.vue'
import MotionSection from './motion/MotionSection.vue'

const activeSellerDrop = { ...DROP_ACTIVE, sellerShort: SELLER_SHORT }
const successSellerDrop = { ...DROP_SUCCESS, sellerShort: SELLER_SHORT }
const claimedDrop = { ...DROP_CLAIMED, sellerShort: SELLER_SHORT }
const expiredSellerDrop = { ...DROP_EXPIRED, sellerShort: SELLER_SHORT }
</script>

<template>
  <div class="lab">
    <header class="lab-head">
      <h1>CrowdDrop · State gallery</h1>
      <p>Treatment 2 — Light / Orange · final refinement · static fixtures only</p>
      <p class="path">Preview: <code>/showcase</code></p>
    </header>

    <section class="cell">
      <h2 class="label">Active Buyer — Header A</h2>
      <p class="sub">CrowdDrop wordmark + wallet row kept</p>
      <DropDetailScreen :drop="DROP_ACTIVE" mode="active-buyer" :show-app-header="true" />
    </section>

    <section class="cell">
      <h2 class="label">Active Buyer — Header B</h2>
      <p class="sub">Detail starts at ← Drop #14 · no repeated wordmark</p>
      <DropDetailScreen :drop="DROP_ACTIVE" mode="active-buyer" :show-app-header="false" />
    </section>

    <section class="cell">
      <h2 class="label">Home</h2>
      <HomeScreen />
    </section>

    <section class="cell">
      <h2 class="label">Active Buyer</h2>
      <p class="sub">Approval required</p>
      <DropDetailScreen :drop="DROP_ACTIVE" mode="active-buyer" />
      <p class="sub">After approval</p>
      <DropDetailScreen :drop="DROP_ACTIVE" mode="active-buyer-join" />
    </section>

    <section class="cell">
      <h2 class="label">Joined Buyer</h2>
      <DropDetailScreen :drop="DROP_ACTIVE" mode="joined-buyer" />
    </section>

    <section class="cell">
      <h2 class="label">Active Seller</h2>
      <DropDetailScreen :drop="activeSellerDrop" mode="active-seller" />
    </section>

    <section class="cell">
      <h2 class="label">Successful Seller</h2>
      <DropDetailScreen :drop="successSellerDrop" mode="successful-seller" />
    </section>

    <section class="cell">
      <h2 class="label">Successful Buyer</h2>
      <DropDetailScreen :drop="DROP_SUCCESS" mode="successful-buyer" />
    </section>

    <section class="cell">
      <h2 class="label">Claimed</h2>
      <DropDetailScreen :drop="claimedDrop" mode="claimed" />
    </section>

    <section class="cell">
      <h2 class="label">Expired Buyer</h2>
      <DropDetailScreen :drop="DROP_EXPIRED" mode="expired-buyer" />
    </section>

    <section class="cell">
      <h2 class="label">Expired Seller</h2>
      <DropDetailScreen :drop="expiredSellerDrop" mode="expired-seller" />
    </section>

    <section class="cell">
      <h2 class="label">Create</h2>
      <CreateScreens mode="create" />
    </section>

    <section class="cell">
      <h2 class="label">Created</h2>
      <CreateScreens mode="created" />
    </section>

    <section class="cell">
      <h2 class="label">Disconnected</h2>
      <SystemScreens mode="disconnected" />
    </section>

    <section class="cell">
      <h2 class="label">Wrong Network</h2>
      <SystemScreens mode="wrong-network" />
    </section>

    <MotionSection />
  </div>
</template>

<style scoped>
.lab {
  min-height: 100dvh;
  padding: 20px 16px 48px;
  background: #1a1a1a;
  color: #e8e8e8;
  font-family: Inter, system-ui, sans-serif;
}
.lab-head {
  max-width: 420px;
  margin: 0 auto 28px;
}
.lab-head h1 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.lab-head p {
  margin: 0;
  font-size: 13px;
  color: #9a9a9a;
  line-height: 1.4;
}
.path {
  margin-top: 8px !important;
}
.path code {
  font-size: 12px;
  color: #c9c9c9;
}
.cell {
  max-width: 420px;
  margin: 0 auto 36px;
}
.label {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #f0f0f0;
}
.sub {
  margin: 0 0 8px;
  font-size: 12px;
  color: #8a8a8a;
}
.cell .sub + :deep(.phone),
.cell :deep(.phone) + .sub {
  margin-top: 14px;
}
</style>
