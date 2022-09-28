const getRawBody = require('raw-body');
const axios = require('axios');

/**
 * parse params from raw body
 * @param {*} req 
 * @returns 
 */
const getData = async (req) => {
  let body = await getRawBody(req);
  body = JSON.parse(body);
  const { ttl = 60, type = 'A', domain, record, ip, token, zone } = body;

  return {
    ttl,
    type,
    domain,
    record,
    ip,
    token,
    zone,
    fullDomain: `${record}.${domain}`
  };
}

/**
 * Get all related records
 * @param {*} params 
 * @param {*} inst 
 * @returns 
 */
const getRecordList = async (params, inst) => {
  let recordList = [], success = true;
  try {
    const { type: recordType, fullDomain } = params;
    const _params = {
      type: recordType,
      name: fullDomain,
      page: 1,
      per_page: 100,
      order: 'type',
    };
    const ret = await inst.get(`/dns_records`, { params: _params });
    if (!ret?.data?.success) {
      throw new Error('get record list error');
    }
    recordList = ret?.data?.result || [];
  } catch (e) {
    success = false;
    recordList = [];
  }

  return { recordList, success };
}


const createAxiosInst = (params) => {
  const { zone, token } = params;
  const inst = axios.create({
    baseURL: `https://api.cloudflare.com/client/v4/zones/${zone}`,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    timeout: 1000 * 10,
  });
  return inst;
}

const findRecord = (recordList, params) => {
  const { fullDomain, type } = params;
  const record = recordList.find(function (_record) {
    return _record.name === fullDomain && _record.type === type;
  });
  return record
}

/**
 * update dns record
 * @param {*} params 
 * @param {*} record 
 * @param {*} inst 
 * @returns
 */
const updateDNSRecord = async (params, record, inst) => {
  let success = true;
  try {
    const { type: recordType, fullDomain, ip, ttl } = params;
    const data = {
      type: recordType,
      name: fullDomain,
      content: ip,
      ttl: ttl
    };
    const res = await inst.put(`/dns_records/${record.id}`, data);
    if (!res?.data?.success) {
      throw new Error('update dns record error');
    }
  } catch (e) {
    success = false;
  }
  return success;
}

exports.handler = async (req, resp, context) => {
  try {
    const params = await getData(req);
    const { token, zone, ip, domain, record } = params;

    if (!token || !zone || !ip || !domain || !record) {
      resp.send(JSON.stringify(1));
      return;
    }

    const inst = createAxiosInst(params);

    const { recordList, success } = await getRecordList(params, inst);
    if (!success) {
      resp.send(JSON.stringify(1));
      return;
    }

    const dnsRecord = findRecord(recordList, params);

    if (!dnsRecord || ip === dnsRecord.content) {
      const code = dnsRecord ? 2 : 1
      resp.send(JSON.stringify(code));
      return;
    }

    const hasSuccess = await updateDNSRecord(params, dnsRecord, inst);

    if (!hasSuccess) {
      resp.send(JSON.stringify(1));
      return;
    }

    resp.setStatusCode(200);
    resp.setHeader('content-type', 'application/json');
    resp.send(JSON.stringify(0));
  } catch (e) {
    resp.send(JSON.stringify(1));
  }
}