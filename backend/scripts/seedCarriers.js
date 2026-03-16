/**
 * Seed script: Populate all carriers from client-provided lists
 * Run: node backend/scripts/seedCarriers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Carrier = require('../models/Carrier');

// ---------------------------------------------------------------------------
// Carrier seed data
// ---------------------------------------------------------------------------

const LIFE_AND_SUPPLEMENTAL_CARRIERS = [
  // Life Insurance
  { name: 'Trans America', category: 'Life Insurance', factor: 80, notes: 'Major life insurance provider' },
  { name: 'American Amicable', category: 'Life Insurance', factor: 90, notes: 'Competitive term and whole life products' },
  { name: 'Foresters Financial', category: 'Life Insurance', factor: null, notes: 'Factor varies by product — see commission schedule' },
  { name: 'Mutual of Omaha', category: 'Life Insurance', factor: null, notes: 'Multiple products — factor per product schedule' },
  { name: 'Assurity Life Insurance', category: 'Supplemental Insurance', factor: null, notes: 'Multiple products with level-based factors — see level guide' },
  { name: 'Globe Term Life (GTL)', category: 'Supplemental Insurance', factor: null, notes: 'Supplemental carrier — level guide available' },
];

const ACA_CARRIERS = [
  'Ambetter (Centene)',
  'Aetna / Aetna CVS Health',
  'Alignment Health Plan',
  'AmeriHealth',
  'Anthem BCBS / Elevance Health',
  'AvMed',
  'Blue Cross Blue Shield',
  'Blue Shield of California',
  'CareSource',
  'Capital BlueCross',
  'Celtic Insurance Company',
  'Cigna Healthcare',
  'Community Health Choice',
  'Dean Health Plan',
  'EmblemHealth',
  'Excellus BCBS',
  'Fallon Health',
  'Florida Blue',
  'Harvard Pilgrim Health Care',
  'Health Alliance Medical Plans',
  'Health First Health Plans',
  'Health Net',
  'Highmark BCBS',
  'Horizon BCBS',
  'Independence Blue Cross',
  'Kaiser Permanente',
  'L.A. Care Health Plan',
  'Medica',
  'MercyCare HMO',
  'Molina Healthcare',
  'MVP Health Care',
  'Neighborhood Health Plan of RI',
  'Oscar Health',
  'PacificSource Health Plans',
  'Presbyterian Health Plan',
  'Priority Health',
  'Quartz Health Solutions',
  'Regence BlueShield',
  'Sanford Health Plan',
  'Security Health Plan',
  'SelectHealth',
  'Sharp Health Plan',
  'Simply Healthcare / Wellpoint',
  'UCare',
  'UnitedHealthcare',
  'University of Utah Health Plans',
  'Wellmark BCBS',
].map(name => ({ name, category: 'Health Insurance', factor: null }));

const MEDICARE_CARRIERS = [
  'Aetna',
  'Alignment Health',
  'AmeriHealth',
  'AmeriHealth Caritas',
  'Anthem',
  'Asuris Northwest Health',
  'BayCare Plus',
  'Blue Cross Blue Shield',
  'Capital Blue Cross',
  'CareFirst',
  'CareSource',
  'Cigna',
  'Clear Spring Health',
  'Clever Care Health Plan',
  'Clover Health',
  'Devoted Health',
  'Elderplan',
  'EmblemHealth',
  'Essence Healthcare',
  'Excellus',
  'Florida Blue',
  'Freedom Health',
  'Geisinger Health Plan',
  'Health First Health Plans',
  'Highmark',
  'Horizon',
  'Humana',
  'Independence Blue Cross',
  'Jefferson Health Plans',
  'Johns Hopkins Healthcare',
  'Kaiser Permanente',
  'Keystone First VIP Choice',
  'Medica',
  'Medical Mutual',
  'MediGold',
  'MetroPlus Health',
  'Molina Healthcare',
  'Mutual of Omaha',
  'MyTru Advantage',
  'PacificSource',
  'Paramount Elite',
  'Priority Health',
  'Providence Health Plan',
  'Regence',
  'SCAN Health Plan',
  'Sentara Health Plans',
  'Simply Healthcare',
  'Sonder Health',
  'SummaCare',
  'The Health Plan',
  'UCLA Health',
  'UnitedHealthcare',
  'Univera Healthcare',
  'UPMC Health Plan',
  'VillageCareMAX',
  'VNS Health',
  'Wellcare',
  'Wellpoint',
  'Zing Health',
].map(name => ({ name, category: 'Medicare', factor: null }));

const ALL_CARRIERS = [
  ...LIFE_AND_SUPPLEMENTAL_CARRIERS,
  ...ACA_CARRIERS,
  ...MEDICARE_CARRIERS,
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------
async function seedCarriers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const carrierData of ALL_CARRIERS) {
      try {
        const existing = await Carrier.findOne({
          name: { $regex: new RegExp(`^${carrierData.name}$`, 'i') }
        });

        if (existing) {
          // Update category/factor if missing
          let updated = false;
          if (!existing.category) { existing.category = carrierData.category; updated = true; }
          if (existing.factor === undefined && carrierData.factor !== null) { existing.factor = carrierData.factor; updated = true; }
          if (carrierData.notes && !existing.notes) { existing.notes = carrierData.notes; updated = true; }
          if (updated) { await existing.save(); console.log(`Updated: ${carrierData.name}`); }
          else { console.log(`Skipped (exists): ${carrierData.name}`); }
          skipped++;
        } else {
          await Carrier.create({
            name: carrierData.name,
            category: carrierData.category,
            factor: carrierData.factor,
            notes: carrierData.notes || '',
            isActive: true
          });
          console.log(`Created: ${carrierData.name} [${carrierData.category}]`);
          created++;
        }
      } catch (err) {
        console.error(`Error seeding ${carrierData.name}:`, err.message);
        errors++;
      }
    }

    console.log('\n--- Seed Summary ---');
    console.log(`Created: ${created}`);
    console.log(`Skipped/Updated: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total carriers in DB: ${await Carrier.countDocuments()}`);

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedCarriers();
