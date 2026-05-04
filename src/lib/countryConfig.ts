// Configuration par pays — cities, NIU patterns, currency
export type ZoneCode = 'CG' | 'CD' | 'CM' | 'GA' | 'TD' | 'CF' | 'GQ' | 'CI' | 'SN' | 'FR';

export interface ZoneConfig {
  name: string;
  flag: string;
  cities: string[];
  currency: string;
  niuLabel: string;
  niuPlaceholder: string;
  niuPattern?: RegExp;
  phonePrefix: string;
  vatRate: number;
}

export const ZONE_CONFIG: Record<ZoneCode, ZoneConfig> = {
  CG: {
    name: 'République du Congo',
    flag: '🇨🇬',
    cities: ['Brazzaville', 'Pointe-Noire', 'Dolisie', 'Nkayi', 'Ouesso', 'Owando', 'Madingou', 'Mossendjo', 'Sibiti', 'Impfondo', 'Kinkala', 'Djambala'],
    currency: 'XAF',
    niuLabel: 'NIU',
    niuPlaceholder: 'P230012345',
    niuPattern: /^P\d{9}$/,
    phonePrefix: '+242',
    vatRate: 18,
  },
  CD: {
    name: 'République Démocratique du Congo',
    flag: '🇨🇩',
    cities: ['Kinshasa', 'Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Bukavu', 'Tshikapa', 'Kolwezi', 'Likasi', 'Goma', 'Matadi', 'Mbandaka', 'Beni', 'Uvira', 'Bunia'],
    currency: 'CDF',
    niuLabel: 'NIF',
    niuPlaceholder: 'A0123456789',
    niuPattern: /^[A-Z]\d{10}$/,
    phonePrefix: '+243',
    vatRate: 16,
  },
  CM: {
    name: 'Cameroun', flag: '🇨🇲',
    cities: ['Yaoundé', 'Douala', 'Bamenda', 'Bafoussam', 'Garoua', 'Maroua', 'Ngaoundéré', 'Bertoua', 'Buea', 'Limbe'],
    currency: 'XAF', niuLabel: 'NIU', niuPlaceholder: 'M012345678901', phonePrefix: '+237', vatRate: 19.25,
  },
  GA: {
    name: 'Gabon', flag: '🇬🇦',
    cities: ['Libreville', 'Port-Gentil', 'Franceville', 'Oyem', 'Moanda', 'Mouila', 'Lambaréné', 'Tchibanga'],
    currency: 'XAF', niuLabel: 'NIF', niuPlaceholder: '7000000', phonePrefix: '+241', vatRate: 18,
  },
  TD: {
    name: 'Tchad', flag: '🇹🇩',
    cities: ['N\'Djamena', 'Moundou', 'Sarh', 'Abéché', 'Kelo', 'Pala', 'Doba'],
    currency: 'XAF', niuLabel: 'NIF', niuPlaceholder: 'NIF000000', phonePrefix: '+235', vatRate: 18,
  },
  CF: {
    name: 'République Centrafricaine', flag: '🇨🇫',
    cities: ['Bangui', 'Bimbo', 'Berbérati', 'Carnot', 'Bambari', 'Bouar'],
    currency: 'XAF', niuLabel: 'NIF', niuPlaceholder: 'CF0000000', phonePrefix: '+236', vatRate: 19,
  },
  GQ: {
    name: 'Guinée Équatoriale', flag: '🇬🇶',
    cities: ['Malabo', 'Bata', 'Ebebiyín', 'Mongomo'],
    currency: 'XAF', niuLabel: 'NIF', niuPlaceholder: 'GQ0000000', phonePrefix: '+240', vatRate: 15,
  },
  CI: {
    name: 'Côte d\'Ivoire', flag: '🇨🇮',
    cities: ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro', 'Korhogo', 'Daloa', 'Man'],
    currency: 'XOF', niuLabel: 'CC', niuPlaceholder: 'CI0000000', phonePrefix: '+225', vatRate: 18,
  },
  SN: {
    name: 'Sénégal', flag: '🇸🇳',
    cities: ['Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Touba', 'Mbour'],
    currency: 'XOF', niuLabel: 'NINEA', niuPlaceholder: 'SN000000', phonePrefix: '+221', vatRate: 18,
  },
  FR: {
    name: 'France', flag: '🇫🇷',
    cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Montpellier', 'Strasbourg', 'Bordeaux', 'Lille'],
    currency: 'EUR', niuLabel: 'SIRET', niuPlaceholder: '12345678900012', phonePrefix: '+33', vatRate: 20,
  },
};

export function getZoneConfig(zone?: string | null): ZoneConfig {
  if (!zone) return ZONE_CONFIG.CG;
  return ZONE_CONFIG[zone as ZoneCode] || ZONE_CONFIG.CG;
}
