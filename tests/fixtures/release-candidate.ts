// Canonical expectations declared before execution. All identities are fictional test data.
export const cases = [
 {id:'A',seller:'RC Cedar Circuit',customer:'RC Otter Freight',need:'Coordinate dispatch reviews.',products:[{id:'board',name:'Dispatch Board',price:32,billing:'monthly',quantity:7,unit:'seat'}],monthly:22400,year:268800,revisionQuantity:11,revisionMonthly:35200,revisionYear:422400},
 {id:'B',seller:'RC Flint Advisory',customer:'RC Meadow Works',need:'Deliver a process map and review it at the kickoff milestone.',products:[{id:'assessment',name:'Process Assessment',price:4200,billing:'once',quantity:1,unit:'project'}],monthly:0,year:420000},
 {id:'C',seller:'RC Amber Agency',customer:'RC Moss Retail',need:'Prepare the campaign setup and monthly reporting.',products:[{id:'setup',name:'Campaign Setup',price:650,billing:'once',quantity:1,unit:'project'},{id:'retainer',name:'Reporting Retainer',price:1400,billing:'monthly',quantity:1,unit:'subscription'}],monthly:140000,year:1745000},
 {id:'D',seller:'RC Birch Learning',customer:'RC Harbor Tools',need:'Run two workshops for eight attendees each.',products:[{id:'session-a',name:'Planning Workshop',price:125,billing:'once',quantity:8,unit:'attendee'},{id:'session-b',name:'Review Workshop',price:175,billing:'once',quantity:8,unit:'attendee'}],monthly:0,year:240000},
 {id:'G',seller:'RC Slate Studio',customer:'RC Willow Transit',need:'Evaluate a provisional coordination service.',products:[{id:'support',name:'Coordination Support',price:85,billing:'monthly',quantity:4,unit:'subscription'}],monthly:34000,year:408000,currency:'EUR',hypothetical:true},
] as const;
// E/F: no numeric authority => no generation. H: an invented replacement price must fail.
// Direct seller-authored fixed terms authorize catalog input; G requires explicit hypothetical authorization.
